from elasticsearch import Elasticsearch

# Connect to Elasticsearch
es = Elasticsearch("https://elastic:LIrp1J5ryZ9=oBgfzhro@localhost:9200", verify_certs=False, timeout=1200)

# Define the index name
index_name = "book_links"

# Delete the existing index (only if necessary, otherwise mappings won't update)
es.indices.delete(index=index_name, ignore=[400, 404])

# Define the index mapping
body = {
    "mappings": {
        "properties": {
            "book_id": {"type": "keyword"},
            "edition_unique_id": {"type": "keyword"},
            "links": {
                "type": "nested",  # Allows storing objects inside an array
                "properties": {
                    "url": {"type": "keyword"},
                    "is_pdf": {"type": "boolean"}
                }
            },
            "update_date": {"type": "date"}
        }
    }
}

# Create the index with the correct mapping
es.indices.create(index=index_name, body=body, ignore=400)

print(f"Index '{index_name}' is ready.")
