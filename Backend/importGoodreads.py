import csv, subprocess, requests

def import_goodreads(csv_file="tmp/goodreads_library_export.csv", api_url="http://127.0.0.1:5001"):
    with open(csv_file, newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            book_id = row.get("Book Id", "").strip()
            if not book_id: 
                continue
            subprocess.run(
                f"cd ../Scraper/billionBook && scrapy crawl goodreads -a start_id={book_id} -a end_id={book_id}",
                shell=True
            )
            for shelf in row.get("Bookshelves", "").split(","):
                shelf = shelf.strip()
                if shelf:
                    requests.post(
                        f"{api_url}/collection/book",
                        json={"collectionId": shelf, "bookId": book_id, "action": 1}
                    )

if __name__ == "__main__":
    import_goodreads()
