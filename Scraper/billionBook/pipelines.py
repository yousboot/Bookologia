import ast
import json
from datetime import datetime
from elasticsearch import Elasticsearch, helpers
from scrapy.exceptions import DropItem

def convert_string_to_epoch_time(date_string):
    if not date_string or isinstance(date_string, int):
        return date_string
    for date_format in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return int(datetime.strptime(date_string, date_format).timestamp())
        except ValueError:
            continue
    return None

def parse_list_field(field_value):
    if isinstance(field_value, list):
        return field_value
    if not field_value:
        return None
    try:
        parsed = ast.literal_eval(field_value)
        if isinstance(parsed, list):
            return parsed
    except (ValueError, SyntaxError):
        pass
    return None

def extract_author_id(author_id_value):
    if not author_id_value:
        return None
    parts = str(author_id_value).split('.', 1)
    try:
        return int(parts[0])
    except ValueError:
        return None

class BillionbookPipeline:
    def open_spider(self, spider):
        self.elasticsearch_client = Elasticsearch(
            "https://localhost:9200",
            basic_auth=("elastic", "LIrp1J5ryZ9=oBgfzhro"),
            verify_certs=False
        )
        self.books_collection = []
        self.authors_collection = []
        self.bulk_size = 3000

    def process_item(self, item, spider):
        cleaned_item = {}
        for key, value in item.items():
            if value == "" or value == "none":
                cleaned_item[key] = None
            else:
                cleaned_item[key] = value

        if "book_id" in cleaned_item:
            # If there's a period in author_id, trim it to only the numeric part
            raw_author_id = cleaned_item.get("author_id")
            numeric_author_id = extract_author_id(raw_author_id)

            document = {
                "book_id": cleaned_item.get("book_id"),
                "title": cleaned_item.get("title"),
                "titlecomplete": cleaned_item.get("titleComplete"),
                "description": cleaned_item.get("description"),
                "thumbnail_url": cleaned_item.get("thumbnailUrl"),
                "genres": parse_list_field(cleaned_item.get("genres")),
                "asin": cleaned_item.get("asin"),
                "isbn_10": cleaned_item.get("isbn_10"),
                "isbn13": cleaned_item.get("isbn13"),
                "publisher": cleaned_item.get("publisher"),
                "series": parse_list_field(cleaned_item.get("series")),
                "author_id": numeric_author_id,
                "publish_date": convert_string_to_epoch_time(cleaned_item.get("publish_date")),
                "characters": parse_list_field(cleaned_item.get("characters")),
                "places": parse_list_field(cleaned_item.get("places")),
                "ratinghistogram": parse_list_field(cleaned_item.get("ratingHistogram")),
                "ratings_count": cleaned_item.get("ratingsCount"),
                "reviews_count": cleaned_item.get("reviewsCount"),
                "num_pages": cleaned_item.get("num_pages"),
                "format": cleaned_item.get("format"),
                "language": cleaned_item.get("language"),
                "awards": parse_list_field(cleaned_item.get("awards")),
                "edition_unique_id": cleaned_item.get("edition_Unique_Id"),
                "createdAt": convert_string_to_epoch_time(cleaned_item.get("createdAt")),
                "updatedAt": convert_string_to_epoch_time(cleaned_item.get("updatedAt")),
                "link": cleaned_item.get("thumbnailUrl"),
                "userRating": cleaned_item.get("userRating", 0)
            }
            self.books_collection.append(document)

            if len(self.books_collection) >= self.bulk_size:
                helpers.bulk(
                    self.elasticsearch_client, 
                    [{
                        "_op_type": "create",
                        "_index": "books_data",
                        "_id": doc["book_id"],
                        "_source": doc
                    } for doc in self.books_collection],
                    ignore_status=[409]
                )
                self.books_collection.clear()

        elif "author_id" in cleaned_item:
            raw_author_id = cleaned_item.get("author_id")
            numeric_author_id = extract_author_id(raw_author_id)

            document = {
                "author_id": numeric_author_id,
                "name": cleaned_item.get("name"),
                "birth_date": cleaned_item.get("birthDate"),
                "death_date": cleaned_item.get("deathDate"),
                "genres": parse_list_field(cleaned_item.get("genres")),
                "influences": parse_list_field(cleaned_item.get("influences")),
                "avg_rating": cleaned_item.get("avgRating"),
                "reviews_count": cleaned_item.get("reviewsCount"),
                "ratings_count": cleaned_item.get("ratingsCount"),
                "about": cleaned_item.get("about"),
                "author_image": cleaned_item.get("authorImage"),
                "createdAt": convert_string_to_epoch_time(cleaned_item.get("createdAt")),
                "updatedAt": convert_string_to_epoch_time(cleaned_item.get("updatedAt")),
                "userRating": cleaned_item.get("userRating", 0)
            }
            self.authors_collection.append(document)

            if len(self.authors_collection) >= self.bulk_size:
                helpers.bulk(
                    self.elasticsearch_client,
                    [{
                        "_op_type": "create",
                        "_index": "authors_data",
                        "_id": doc["author_id"],
                        "_source": doc
                    } for doc in self.authors_collection],
                    ignore_status=[409]
                )
                self.authors_collection.clear()

        else:
            raise DropItem("Unknown item type: missing book_id or author_id")

        return item

    def close_spider(self, spider):
        if self.books_collection:
            helpers.bulk(
                self.elasticsearch_client, 
                [{"_index": "books_data", "_source": doc} for doc in self.books_collection]
            )
        if self.authors_collection:
            helpers.bulk(
                self.elasticsearch_client,
                [{"_index": "authors_data", "_source": doc} for doc in self.authors_collection]
            )
        self.elasticsearch_client.transport.close()
