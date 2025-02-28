import requests
import fitz  # PyMuPDF
from io import BytesIO

def get_pdf_pages_from_url(pdf_url):
    try:
        response = requests.get(pdf_url, timeout=10)
        response.raise_for_status()

        pdf_file = BytesIO(response.content)
        doc = fitz.open(stream=pdf_file, filetype="pdf")

        return {"url": pdf_url, "pages": len(doc)}

    except Exception as e:
        return {"error": str(e)}

# Example usage
pdf_link = "https://ia600502.us.archive.org/12/items/TheArtOfWarBySunTzu/ArtOfWar.pdf"
print(get_pdf_pages_from_url(pdf_link))


