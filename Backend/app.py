import random
import re
import subprocess
import elasticsearch
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from elasticsearch import Elasticsearch
from database_connector import DatabaseConnector
from googlesearch import search
from duckduckgo_search import DDGS
import fitz  # PyMuPDF
from io import BytesIO
import requests
import bcrypt
from datetime import datetime, timedelta

app = Flask(__name__)
es_connector = DatabaseConnector(db_type="elasticsearch", environment="prod")
es_connector.connect()
es = es_connector.connection



'''
        Routes are orgnized as follow :
        
            1. Book
                1.1  Display book info
                1.2  Add or remove from collection
                1.3  Search pdf
                1.4  Like / Dislike book
                1.5  Recommendation : More editions 
                1.6  Recommendation : Similar books 
                1.7  Recommendation : Same author 
            2. Author 
                2.1  Display author info
                2.2  Like / Dislike author
                2.3  Recommendation : Books by author
                3.4  Recommendation : Similar authors
            3. Home 
                3.1  Search book
                3.2  Search author
                3.3  Recommended books
            4. Collection
                4.1  Display collection
                4.2  Create collection
                4.3  Remove collection
                4.4  Rename collection 
                4.5  Display list of collections
'''



# Main route
@app.route("/")

def index():
    return render_template("index.html")

'''
    1. Book
'''

# ( 1.1 ) Display book info
@app.route('/book/<book_id>', methods=['GET'])
def get_book(book_id):
    try:
        response = es.search(index="books_data_bis", body={
            "query": {
                "term": {"book_id": book_id}
            }
        })

        if response["hits"]["total"]["value"] > 0:
            return jsonify(response["hits"]["hits"][0]["_source"])
        else:
            return jsonify({"error": "Book not found"}), 404
    except Exception as e:
        print(f"Error retrieving book with id '{book_id}': {e}")
        return jsonify({"error": str(e)}), 500

# New route for the book page (HTML)
@app.route('/bookPage/<book_id>', methods=['GET'])
def book_page(book_id):
    try:
        response = es.search(index="books_data_bis", body={
            "query": {
                "term": {"book_id": book_id}
            }
        })

        if response["hits"]["total"]["value"] > 0:
            book_data = response["hits"]["hits"][0]["_source"]
            return render_template("book.html", book=book_data)
        else:
            return render_template("book_not_found.html"), 404 #create a book_not_found.html template
    except Exception as e:
        print(f"Error retrieving book with id '{book_id}': {e}")
        return render_template("error.html", error=str(e)), 500 #create a error.html template
    
# ( 1.2 ) Add or remove from collection
@app.route('/collection/book', methods=['POST'])
def modify_collection():
    data = request.json
    collection_id = data.get("collectionId")
    book_id = data.get("bookId")
    action = data.get("action")  # 1 for add, -1 for remove

    response = es.get(index="user_collections", id=collection_id)
    if not response["found"]:
        return jsonify({"error": "Collection not found"})
    
    collection = response["_source"]
    book_ids = set(collection.get("bookIds", []))
    if action == 1:
        book_ids.add(book_id)
    elif action == -1:
        book_ids.discard(book_id)
    
    es.update(index="user_collections", id=collection_id, body={"doc": {"bookIds": list(book_ids)}})
    return jsonify({"status": "success"})

# ( 1.3 ) Search pdf

def get_pdf_page_count(url):
    # Try fetching only the first 15KB. Note: This may fail if page count info is elsewhere.
    headers = {"Range": "bytes=0-15000"}
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    pdf_data = BytesIO(response.content)
    doc = fitz.open(stream=pdf_data, filetype="pdf")
    return len(doc)

def get_pdf_details(url):
    try:
        response = requests.get(url, timeout=10, stream=True)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "")
        is_pdf = "pdf" in content_type.lower()

        
        return {"url": url, "is_pdf": is_pdf}
    except Exception:
        return {"url": url, "is_pdf": False, "pages": 0}

@app.route('/book/pdf-search/<book_id>', methods=['GET'])
def get_book_pdf_links(book_id):
    try:
        # Fetch book details to get edition_unique_id
        book_response = es.search(index="books_data_bis", body={
            "query": {"term": {"book_id": book_id}}
        })

        if book_response["hits"]["total"]["value"] == 0:
            return jsonify({"error": "Book not found"}), 404

        book = book_response["hits"]["hits"][0]["_source"]
        edition_unique_id = book.get("edition_unique_id", "")
        title = book.get("title", "")
        author = " ".join(book.get("author_id", "").split(".")[1].split("_"))

        if not edition_unique_id or not title or not author:
            return jsonify({"error": "Book edition ID, title, or author not found"}), 400

        # Check if links already exist in book_links index
        existing_links_response = es.search(index="book_links", body={
            "query": {"term": {"edition_unique_id": edition_unique_id}}
        })

        if existing_links_response["hits"]["total"]["value"] > 0:
            existing_doc = existing_links_response["hits"]["hits"][0]["_source"]
            existing_links = existing_doc["links"]
            update_date = existing_doc["update_date"]

            # Check if the links are fresh (less than 15 days old)
            if datetime.strptime(update_date, "%Y-%m-%dT%H:%M:%S") > datetime.utcnow() - timedelta(days=15):
                return jsonify({
                    "book_id": book_id,
                    "links": existing_links,
                    "query": f"{title} {author} filetype:pdf"
                })

        # If links are outdated or missing, fetch new ones
        search_query = f"{title} {author} filetype:pdf"
        links = []

        try:
            links = list(search(search_query, num=4, stop=4))
            if not links:
                raise ValueError("No results from Google")
        except Exception:
            links = [result["href"] for result in DDGS().text(search_query, max_results=5)]

        pdf_details = [{"url": link, "is_pdf": get_pdf_details(link)["is_pdf"]} for link in links]

        # Update or insert new links in book_links index
        es.index(index="book_links", id=edition_unique_id, body={
            "edition_unique_id": edition_unique_id,
            "book_id": book_id,
            "links": pdf_details,
            "update_date": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")
        })

        return jsonify({
            "book_id": book_id,
            "links": pdf_details,
            "query": search_query
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ( 1.4 ) Like / Dislike book
@app.route('/update/book/rating', methods=['POST'])
def update_book_rating():
    data = request.json
    book_id = data.get("bookId")
    rating = data.get("rating")

    response = es.update_by_query(index="books_data_bis", body={
        "script": {
            "source": "ctx._source.userRating = params.rating",
            "lang": "painless",
            "params": {"rating": rating}
        },
        "query": {
            "term": {"book_id": book_id}
        }
    })

    return jsonify({"status": "success" if response["updated"] > 0 else "fail"})

# ( 1.5 ) Recommendation : More editions 
@app.route('/book/editions/<book_id>', methods=['GET'])
def get_more_editions(book_id):
    book_response = es.search(index="books_data_bis", body={
        "query": {"term": {"book_id": book_id}}
    })

    if book_response["hits"]["total"]["value"] == 0:
        return jsonify({"error": "Book not found"}), 404

    edition_id = book_response["hits"]["hits"][0]["_source"]["edition_unique_id"]

    response = es.search(index="books_data_bis", body={
        "query": {"term": {"edition_unique_id": edition_id}},
        "size": 50
    })

    return jsonify([hit["_source"]["book_id"] for hit in response["hits"]["hits"]])

# ( 1.6 ) Recommendation : Similar books 
def get_similar_books_internal(book_id):
    q = {
        "query": {
            "more_like_this": {
                "fields": ["genres", "description", "language"],
                "like": [{"_index": "books_data_bis", "_id": book_id}],
                "min_term_freq": 1
            }
        },
        "aggs": {
            "by_edition": {
                "terms": {"field": "edition_unique_id.keyword", "size": 50},
                "aggs": {
                    "top_book": {
                        "top_hits": {
                            "sort": [{"reviews_count": {"order": "desc"}}],
                            "size": 1
                        }
                    }
                }
            }
        },
        "size": 0
    }
    res = es.search(index="books_data_bis", body=q)
    return [b["top_book"]["hits"]["hits"][0] for b in res["aggregations"]["by_edition"]["buckets"]]


def get_similar_books_multiple(book_ids, num_books=100):
    q = {
        "query": {
            "more_like_this": {
                "fields": ["genres", "description", "language"],
                "like": [{"_index": "books_data_bis", "_id": bid} for bid in book_ids],
                "min_term_freq": 1
            }
        },
        "aggs": {
            "by_edition": {
                "terms": {"field": "edition_unique_id.keyword", "size": num_books},
                "aggs": {
                    "top_book": {
                        "top_hits": {
                            "sort": [{"reviews_count": {"order": "desc"}}],
                            "size": 1
                        }
                    }
                }
            }
        },
        "size": 0
    }
    res = es.search(index="books_data_bis", body=q)
    return [b["top_book"]["hits"]["hits"][0] for b in res["aggregations"]["by_edition"]["buckets"]]



@app.route('/similar/<book_id>')
def similar(book_id):
    print(get_similar_books_internal(book_id))
    return jsonify(get_similar_books_internal(book_id))


# ( 1.7 ) Recommendation : Same author 
@app.route('/book/same-author/<book_id>', methods=['GET'])
def get_books_from_same_author(book_id):
    # Fetch the book details to get the author_id
    book_response = es.search(index="books_data_bis", body={
        "query": {"term": {"book_id.keyword": book_id}}
    })

    if book_response["hits"]["total"]["value"] == 0:
        return jsonify({"error": "Book not found"}), 404

    author_id = book_response["hits"]["hits"][0]["_source"]["author_id"]

    # Query to get unique editions of books from the same author
    query = {
        "query": {
            "term": {"author_id.keyword": author_id}
        },
        "aggs": {
            "by_edition": {
                "terms": {"field": "edition_unique_id.keyword", "size": 30},
                "aggs": {
                    "top_book": {
                        "top_hits": {
                            "sort": [{"reviews_count": {"order": "desc"}}],
                            "size": 1,
                            "_source": ["book_id"]
                        }
                    }
                }
            }
        },
        "size": 0
    }

    response = es.search(index="books_data_bis", body=query)

    return jsonify([
        bucket["top_book"]["hits"]["hits"][0]["_source"]["book_id"]
        for bucket in response["aggregations"]["by_edition"]["buckets"]
    ])



'''
    2. Author 
'''

# ( 2.1 ) Display author info
@app.route('/author/<author_id>', methods=['GET'])
def get_author(author_id):
    response = es.search(index="authors_data", body={
        "query": {
            "term": {"author_id": author_id}
        }
    })

    if response["hits"]["total"]["value"] > 0:
        return jsonify(response["hits"]["hits"][0]["_source"])
    else:
        return jsonify({"error": "Author not found"}), 404

# ( 2.2 ) Like / Dislike author
@app.route('/update/author/rating', methods=['POST'])
def update_author_rating():
    data = request.json
    author_id = data.get("authorId")
    rating = data.get("rating")

    response = es.update_by_query(index="authors_data", body={
        "script": {
            "source": "ctx._source.userRating = params.rating",
            "lang": "painless",
            "params": {"rating": rating}
        },
        "query": {
            "term": {"author_id": author_id}
        }
    })

    return jsonify({"status": "success" if response["updated"] > 0 else "fail"})

# ( 2.3 ) Books by author
@app.route('/books-by-author/<author_id>', methods=['GET'])
def get_books_by_author(author_id):
    response = es.search(index="books_data_bis", body={
        "size": 0,
        "query": {"term": {"author_id": author_id}},
        "aggs": {
            "unique_editions": {
                "terms": {"field": "edition_unique_id", "size": 50},
                "aggs": {
                    "min_book": {
                        "top_hits": {
                            "size": 1,
                            "sort": [{"book_id": {"order": "asc"}}],
                            "_source": ["book_id"]
                        }
                    }
                }
            }
        }
    })

    books = [
        bucket["min_book"]["hits"]["hits"][0]["_source"]["book_id"]
        for bucket in response["aggregations"]["unique_editions"]["buckets"]
        if bucket["min_book"]["hits"]["hits"][0]["_source"].get("book_id")
    ]

    return jsonify(books)


# ( 2.3 ) Books by author
@app.route('/similar-authors/<author_id>', methods=['GET'])
def get_similar_authors(author_id):
    books = get_books_by_author(author_id).json
    if not books:
        return jsonify({"error": "No books found for this author"}), 404

    similar_books = get_similar_books_internal(books, num_books=50)

    if not similar_books:
        return jsonify([])

    similar_authors = extract_authors_from_books(similar_books)

    return jsonify(similar_authors)



'''
    3. Home 
'''

# ( 3.1 ) Search book
@app.route('/search/books', methods=['GET'])
def search_books():
    query = request.args.get('q', '')
    num_books = int(request.args.get('numBooks', 20))  # default to 20 if not specified
    
    search_query = {
        "query": {
            "bool": {
                "should": [
                    {
                        "wildcard": {
                            "title.keyword": {
                                "value": f"*{query}*",
                                "case_insensitive": True
                            }
                        }
                    }
                ]
            }
        },
        "size": 0,  # We rely on the aggregation below
        "aggs": {
            "unique_editions": {
                "terms": {
                    "field": "edition_unique_id",
                    "size": num_books
                },
                "aggs": {
                    "top_unique_hits": {
                        "top_hits": {
                            "size": 1,
                            "sort": [{"_score": "desc"}],
                            "_source": ["book_id", "title"]
                        }
                    }
                }
            }
        }
    }
    
    response = es.search(index="books_data", body=search_query)
    
    books = [
        bucket["top_unique_hits"]["hits"]["hits"][0]["_source"]["book_id"]
        for bucket in response["aggregations"]["unique_editions"]["buckets"]
    ]
    
    return jsonify(books)



# ( 3.2 ) Search author
@app.route('/search/authors', methods=['GET'])
def search_authors():
    query = request.args.get('q', '')
    response = es.search(index="authors_data", body={
        "query": {
            "multi_match": {
                "query": query,
                "fields": ["name"],
                "fuzziness": "AUTO"
            }
        },
        "size": 20
    })
    return jsonify([hit["_source"]["author_id"] for hit in response["hits"]["hits"]])

# ( 3.3 ) Recommended books
@app.route('/homeRecommendation_bis', methods=['GET'])
def home_recommendation():
    liked = [h["_source"]["book_id"] for h in es.search(
        index="books_data_bis", body={"size": 100, "query": {"range": {"userRating": {"gt": 0}}}, "_source": ["book_id"]}
    )["hits"]["hits"]]
    collected = []
    for h in es.search(
        index="user_collections", body={"size": 1000, "query": {"match_all": {}}, "_source": ["bookIds"]}
    )["hits"]["hits"]:
        collected.extend(h["_source"].get("bookIds", []))
    seeds = list(set(liked + collected))
    if not seeds:
        default = es.search(index="books_data_bis", body={"size": 100, "query": {"match_all": {}}, "_source": ["book_id"]})
        return jsonify([h["_source"]["book_id"] for h in default["hits"]["hits"]])
    return jsonify(get_similar_books_multiple(seeds, num_books=100))


@app.route('/homeRecommendation', methods=['GET'])
def merged_similar_recommendations():
    response = similar_to_books_liked_by_user()
    
    # Ensure response is a Flask response object
    if isinstance(response, tuple):
        response, status_code = response
        if status_code != 200:
            return jsonify([]), status_code  # Handle errors properly

    if response.is_json:
        liked = response.get_json()
    else:
        liked = []
        
    return jsonify(liked)




@app.route('/books_liked_by_user', methods=['GET'])
def books_liked_by_user():
    try:
        q = {"query": {"term": {"userRating": 1}}}
        res = es.search(index="books_data_bis", body=q)
        return jsonify([hit["_source"] for hit in res["hits"]["hits"]])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/similar_to_books_liked_by_user', methods=['GET'])
def similar_to_books_liked_by_user():
    user_id = get_user_id_from_session()
    print("user_id : ", user_id)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    doc_id = f"user_{user_id}"
    
    response = es.get(index="user_likes", id=doc_id, ignore=[404])
    if not response.get("found"):
        return jsonify({"error": "No liked books found"}), 404

    liked_books = response["_source"].get("liked_book_ids", [])
    print("liked_books :", liked_books)
    if not liked_books:
        return jsonify([])

    num_books_needed = len(liked_books) * 10  

    query_body = {
        "query": {
            "more_like_this": {
                "fields": ["genres", "description", "language"],
                "like": [{"_index": "books_data_bis", "_id": book_id} for book_id in liked_books],
                "min_term_freq": 1
            }
        },
        "size": 0,  # Don't return raw hits, rely on aggregation
        "aggs": {
            "unique_books": {
                "terms": {
                    "field": "edition_unique_id.keyword",
                    "size": num_books_needed  # Get at least 10 per liked book
                },
                "aggs": {
                    "top_book": {
                        "top_hits": {
                            "size": 1,
                            "_source": ["book_id"]
                        }
                    }
                }
            }
        }
    }

    response = es.search(index="books_data_bis", body=query_body)

    recommended_books = [
        bucket["top_book"]["hits"]["hits"][0]["_source"]["book_id"]
        for bucket in response["aggregations"]["unique_books"]["buckets"]
    ]
    print("recommended_books : ", recommended_books)
    return jsonify(recommended_books)




@app.route('/book_in_user_collections', methods=['GET'])
def book_in_user_collections():
    try:
        res = es.search(index="user_collections", body={"query": {"match_all": {}}}, size=1000)
        books = set()
        for hit in res["hits"]["hits"]:
            books.update(hit["_source"].get("bookIds", []))
        return jsonify(list(books))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/similar_to_book_in_user_collections', methods=['GET'])
def similar_to_book_in_user_collections():
    try:
        coll = es.search(index="user_collections", body={"query": {"match_all": {}}}, size=1000)
        ids = set(sum([h["_source"].get("bookIds", []) for h in coll["hits"]["hits"]], []))
        res = {}
        for bid in ids:
            q = {
                "query": {
                    "more_like_this": {
                        "fields": ["genres", "description", "language"],
                        "like": [{"_index": "books_data_bis", "_id": bid}],
                        "min_term_freq": 1
                    }
                },
                "size": 2
            }
            sim = es.search(index="books_data_bis", body=q)
            res[bid] = [r["_source"]["book_id"] for r in sim["hits"]["hits"] if "book_id" in r["_source"]]
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500




'''
    4. Collection 
'''

# ( 4.1 ) Display collection
@app.route('/collection/<collection_id>', methods=['GET'])
def get_collection(collection_id):
    response = es.get(index="user_collections", id=collection_id)
    return jsonify(response["_source"]) if response["found"] else jsonify({"error": "Collection not found"})

# ( 4.2 ) Create collection
@app.route('/collection', methods=['POST'])
def create_collection():
    """Create a new collection and add it to the user's meta collections."""
    user_id = get_user_id_from_session()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    response = es.index(index="user_collections", body=data)
    collection_id = response["_id"]

    # Update user's meta collection index
    user_meta = es.get(index="meta_collections_indice", id=user_id, ignore=[404])
    collections = set(user_meta["_source"].get("listofCollections_ID", [])) if user_meta.get("found") else set()
    collections.add(collection_id)

    es.index(index="meta_collections_indice", id=user_id, body={"user_id": user_id, "listofCollections_ID": list(collections)})

    return jsonify({"status": "success", "id": collection_id, "name": data.get("title", "Unnamed Collection")})


# ( 4.3 ) Rename collection
@app.route('/collection/<collection_id>', methods=['PUT'])
def update_collection_title(collection_id):
    data = request.json
    response = es.update(index="user_collections", id=collection_id, body={"doc": {"title": data.get("title")}})
    return jsonify({"status": "success", "updatedTitle": data.get("title")})

# ( 4.4 ) Remove collection 
@app.route('/collection/<collection_id>', methods=['DELETE'])
def delete_collection(collection_id):
    """Delete a collection and remove it from the user's meta collections."""
    user_id = get_user_id_from_session()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    # Delete the collection
    es.delete(index="user_collections", id=collection_id, ignore=[404])

    # Update user's meta collection index
    user_meta = es.get(index="meta_collections_indice", id=user_id, ignore=[404])
    if user_meta.get("found"):
        collections = set(user_meta["_source"].get("listofCollections_ID", []))
        collections.discard(collection_id)
        es.index(index="meta_collections_indice", id=user_id, body={"user_id": user_id, "listofCollections_ID": list(collections)})

    return jsonify({"status": "success"})


# ( 4.5 ) Display list of collections
@app.route('/collections', methods=['GET'])
def get_collections():
    """Retrieve only collections belonging to the authenticated user."""
    user_id = get_user_id_from_session()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    # Retrieve user's collection IDs from meta_collections_indice
    user_data = es.get(index="meta_collections_indice", id=user_id, ignore=[404])
    collection_ids = user_data["_source"].get("listofCollections_ID", []) if user_data.get("found") else []

    if not collection_ids:
        return jsonify([])  # No collections for this user

    # Fetch collection details
    response = es.mget(index="user_collections", body={"ids": collection_ids})
    collections = [
        {"id": doc["_id"], "name": doc["_source"].get("title", "Unnamed Collection")}
        for doc in response.get("docs", []) if doc.get("found")
    ]

    return jsonify(collections)



'''         Import goodreads book       '''
@app.route('/import/goodreads', methods=['POST'])
def import_goodreads_link():
    data = request.json
    goodreads_url = data.get("link", "")
    try:
        segments = goodreads_url.strip().split("/")
        book_segment = segments[5] if len(segments) > 5 else ""
        book_id = book_segment.split("-")[0]
        subprocess.run(f"cd ../Scraper/billionBook && scrapy crawl goodreads -a start_id={book_id} -a end_id={book_id}",
                       shell=True, check=True)
        return jsonify({"status": "success", "book_id": book_id})
    except Exception as e:
        return jsonify({"status": "failure", "error": str(e)})


'''         Helper functions            '''
def extract_authors_from_books(book_ids):
    response = es.search(index="books_data_bis", body={
        "size": 50,
        "query": {
            "terms": {"book_id": book_ids}
        },
        "_source": ["author_id"]
    })

    return list(set(
        hit["_source"]["author_id"] for hit in response["hits"]["hits"]
        if hit["_source"].get("author_id")
    ))

@app.route('/collection/add', methods=['POST'])
def add_to_collection():
    data = request.json
    collection_id = data.get("collectionId")
    book_id = data.get("bookId")

    if not collection_id or not book_id:
        return jsonify({"error": "Missing collectionId or bookId"}), 400

    response = es.get(index="user_collections", id=collection_id)
    if not response["found"]:
        return jsonify({"error": "Collection not found"}), 404

    collection = response["_source"]
    book_ids = set(collection.get("bookIds", []))
    book_ids.add(book_id)

    es.update(index="user_collections", id=collection_id, body={"doc": {"bookIds": list(book_ids)}})
    return jsonify({"status": "success", "action": "added"})

@app.route('/collection/remove', methods=['POST'])
def remove_from_collection():
    data = request.json
    collection_id = data.get("collectionId")
    book_id = data.get("bookId")

    if not collection_id or not book_id:
        return jsonify({"error": "Missing collectionId or bookId"}), 400

    response = es.get(index="user_collections", id=collection_id)
    if not response["found"]:
        return jsonify({"error": "Collection not found"}), 404

    collection = response["_source"]
    book_ids = set(collection.get("bookIds", []))
    book_ids.discard(book_id)

    es.update(index="user_collections", id=collection_id, body={"doc": {"bookIds": list(book_ids)}})
    return jsonify({"status": "success", "action": "removed"})

@app.route('/collections/book/<book_id>', methods=['GET'])
def check_book_in_collections(book_id):
    response = es.search(index="user_collections", body={
        "query": {"term": {"bookIds": book_id}}
    })

    if response["hits"]["hits"]:
        collection_id = response["hits"]["hits"][0]["_id"]
        return jsonify({"inCollection": True, "collectionId": collection_id})
    
    return jsonify({"inCollection": False, "collectionId": None})

@app.route('/books', methods=['GET'])
def get_books():
    book_ids = request.args.get("ids", "").split(",")
    if not book_ids or book_ids == [""]:
        return jsonify([])

    query = {
        "query": {
            "terms": {"book_id": book_ids}
        },
        "_source": ["book_id", "description", "num_pages", "title", "thumbnail_url", "author_id"]
    }

    response = es.search(index="books_data_bis", body=query)
    books = [hit["_source"] for hit in response["hits"]["hits"]]

    return jsonify(books)


'''
Users
'''
app.secret_key = "supersecretkey"

@app.route("/welcome", methods=["GET"])
def welcome_page():
    return render_template("welcome.html")


@app.route("/register", methods=["POST"])
def register():
    data = request.json
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")
    confirm_password = data.get("confirm_password")

    if not username or not email or not password or not confirm_password:
        return jsonify({"error": "Missing fields"}), 400

    if password != confirm_password:
        return jsonify({"error": "Passwords do not match"}), 400

    if not re.match("^[a-zA-Z0-9]+$", password):
        return jsonify({"error": "Password must contain only letters and numbers"}), 400

    existing_user = es.search(index="users", body={"query": {"match": {"email": email}}})
    if existing_user["hits"]["total"]["value"] > 0:
        return jsonify({"error": "Email already registered"}), 400

    hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    user_data = {
        "username": username,
        "email": email,
        "hashed_password": hashed_password
    }
    es.index(index="users", body=user_data)

    default_liked_books = ["1611724", "866690", "928934", "380285"]
    liked_books_collection = {
        "title": "Liked books",
        "bookIds": default_liked_books
    }
    response = es.index(index="user_collections", body=liked_books_collection)
    collection_id = response["_id"]

    es.index(index="meta_collections_indice", id=email, body={
        "user_id": email,
        "listofCollections_ID": [collection_id]
    })

    es.index(index="user_likes", id=f"user_{email}", body={"user_id": email, "liked_book_ids": default_liked_books})

    return jsonify({"status": "Account created successfully", "redirect": "/welcome"})



import secrets

@app.route("/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    res = es.search(index="users", body={
        "query": {"match": {"email": email}}
    })

    if res["hits"]["total"]["value"] == 0:
        return jsonify({"error": "User not found"}), 404

    user = res["hits"]["hits"][0]["_source"]
    
    if bcrypt.checkpw(password.encode('utf-8'), user["hashed_password"].encode('utf-8')):
        session_token = secrets.token_hex(32)  # Secure random session ID
        es.index(index="sessions", id=session_token, body={"user_id": user["email"]})

        response = jsonify({"status": "success", "redirect": "/"})
        response.set_cookie("sessionToken", session_token, httponly=True, secure=True, samesite="Strict")
        return response

    return jsonify({"error": "Invalid credentials"}), 401



@app.route("/check-email", methods=["POST"])
def check_email():
    data = request.json
    email = data.get("email")

    res = es.search(index="users", body={"query": {"term": {"email": email}}})

    if res["hits"]["total"]["value"] > 0:
        return jsonify({"exists": True})
    
    return jsonify({"exists": False})


@app.route("/delete_account", methods=["DELETE"])
def delete_account():
    if 'user' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    es.delete_by_query(index="users", body={
        "query": {"term": {"username": session['user']}}
    })
    session.pop('user', None)
    return jsonify({"status": "Account deleted successfully"})

@app.route("/")
def welcome():
    return render_template("/")

@app.route("/about")
def aboutPage():
    return render_template("about.html")

@app.route("/privacy")
def privacyPage():
    return render_template("privacy.html")

@app.route("/terms")
def termsPage():
    return render_template("terms.html")

@app.route('/collectionPage')
def collections_page():
    return render_template("collection.html")


@app.route('/random-books', methods=['GET'])
def get_random_books():
    try:
        response = es.search(index="books_data_bis", body={
            "query": {"match_all": {}},
            "size": 1000,
            "_source": ["book_id"]
        })
        
        book_ids = [hit["_source"]["book_id"] for hit in response["hits"]["hits"]]
        random_books = random.sample(book_ids, min(15, len(book_ids)))
        
        return jsonify(random_books)
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
    
def get_user_id_from_session():
    session_token = request.cookies.get("sessionToken")
    if not session_token:
        return None

    response = es.get(index="sessions", id=session_token, ignore=[404])
    return response["_source"]["user_id"] if response.get("found") else None



@app.route('/book/like', methods=['POST'])
def like_book():
    data = request.json
    book_id = data.get("bookId")
    user_id = get_user_id_from_session()

    if not user_id or not book_id:
        return jsonify({"error": "Unauthorized or missing bookId"}), 400

    doc_id = f"user_{user_id}"
    response = es.get(index="user_likes", id=doc_id, ignore=[404])
    liked_books = set(response["_source"].get("liked_book_ids", [])) if response.get("found") else set()

    liked_books.add(book_id)

    es.index(index="user_likes", id=doc_id, body={"user_id": user_id, "liked_book_ids": list(liked_books)})

    # --- Add book to "Liked books" collection ---
    user_meta = es.get(index="meta_collections_indice", id=user_id, ignore=[404])
    if user_meta.get("found"):
        liked_books_collection_id = user_meta["_source"]["listofCollections_ID"][0]

        collection = es.get(index="user_collections", id=liked_books_collection_id, ignore=[404])
        if collection.get("found"):
            book_ids = set(collection["_source"].get("bookIds", []))
            book_ids.add(book_id)

            es.update(index="user_collections", id=liked_books_collection_id, body={"doc": {"bookIds": list(book_ids)}})

    return jsonify({"status": "success", "action": "liked"})




@app.route('/book/unlike', methods=['POST'])
def unlike_book():
    data = request.json
    book_id = data.get("bookId")
    user_id = get_user_id_from_session()

    if not user_id or not book_id:
        return jsonify({"error": "Unauthorized or missing bookId"}), 400

    doc_id = f"user_{user_id}"

    response = es.get(index="user_likes", id=doc_id, ignore=[404])
    if not response.get("found"):
        return jsonify({"error": "User has no liked books"}), 404

    liked_books = set(response["_source"].get("liked_book_ids", []))
    if book_id in liked_books:
        liked_books.remove(book_id)

        es.update(index="user_likes", id=doc_id, body={"doc": {"liked_book_ids": list(liked_books)}})

    # --- Remove book from "Liked books" collection ---
    user_meta = es.get(index="meta_collections_indice", id=user_id, ignore=[404])
    if user_meta.get("found"):
        liked_books_collection_id = user_meta["_source"]["listofCollections_ID"][0]

        collection = es.get(index="user_collections", id=liked_books_collection_id, ignore=[404])
        if collection.get("found"):
            book_ids = set(collection["_source"].get("bookIds", []))
            book_ids.discard(book_id)

            es.update(index="user_collections", id=liked_books_collection_id, body={"doc": {"bookIds": list(book_ids)}})

    return jsonify({"status": "success", "action": "unliked"})


@app.route("/logout", methods=["POST"])
def logout():
    session_token = request.cookies.get("sessionToken")
    
    if session_token:
        es.delete(index="sessions", id=session_token, ignore=[404])  # Remove session from database
    
    response = jsonify({"status": "success"})
    response.set_cookie("sessionToken", "", expires=0, path="/")  # Clear session cookie
    return response


@app.route("/check-session", methods=["GET"])
def check_session():
    session_token = request.cookies.get("sessionToken")
    if not session_token:
        return jsonify({"loggedIn": False})  # No session cookie means logged out

    response = es.get(index="sessions", id=session_token, ignore=[404])
    return jsonify({"loggedIn": bool(response.get("found"))})



    
if __name__ == '__main__':
    app.run(debug=False, port=5001)


