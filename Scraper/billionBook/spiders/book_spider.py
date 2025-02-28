"""Spider to extract information from a /book/show type page on Goodreads"""

import scrapy
import time

from .author_spider import AuthorSpider
from ..items import BookItem, BookLoader

class BookSpider(scrapy.Spider):
    name = "book"

    def __init__(self):
        super().__init__()
        self.author_spider = AuthorSpider()

    def parse(self, response, loader=None):
        max_retries = 10
        retry_count = response.meta.get('retry_count', 0)        
        try:
            if not loader:
                loader = BookLoader(BookItem(), response=response)
            
            loader.add_value('book_id', str(response.request.url).split('/')[-1])
            loader.add_css('title', 'script#__NEXT_DATA__::text')
            loader.add_css('titleComplete', 'script#__NEXT_DATA__::text')
            loader.add_css('description', 'script#__NEXT_DATA__::text')
            loader.add_css('thumbnailUrl', 'script#__NEXT_DATA__::text')
            loader.add_css('genres', 'script#__NEXT_DATA__::text')
            loader.add_css('asin', 'script#__NEXT_DATA__::text')
            loader.add_css('isbn_10', 'script#__NEXT_DATA__::text')
            loader.add_css('isbn13', 'script#__NEXT_DATA__::text')
            loader.add_css('publisher', 'script#__NEXT_DATA__::text')
            loader.add_css('series', 'script#__NEXT_DATA__::text')
            loader.add_css('author_name', 'script#__NEXT_DATA__::text')
            loader.add_css('publish_date', 'script#__NEXT_DATA__::text')
            loader.add_css('characters', 'script#__NEXT_DATA__::text')
            loader.add_css('places', 'script#__NEXT_DATA__::text')
            loader.add_css('ratingHistogram', 'script#__NEXT_DATA__::text')
            loader.add_css("ratingsCount", 'script#__NEXT_DATA__::text')
            loader.add_css("reviewsCount", 'script#__NEXT_DATA__::text')
            loader.add_css('num_pages', 'script#__NEXT_DATA__::text')
            loader.add_css("format", 'script#__NEXT_DATA__::text')
            loader.add_css('language', 'script#__NEXT_DATA__::text')
            loader.add_css("awards", 'script#__NEXT_DATA__::text')
            loader.add_css("edition_Unique_Id",'script#__NEXT_DATA__::text'.split('/')[-1])
            author_url = response.css('a.ContributorLink::attr(href)').extract_first()
            loader.add_value('author_id', author_url.split('/')[-1])
            yield response.follow(author_url, callback=self.author_spider.parse)
            loaded_item = loader.load_item()
            
        except Exception as e:
            if retry_count < max_retries:
                # print(f"Failed to process {response.request.url}, retry number: {retry_count + 1} ...")
                yield scrapy.Request(
                    url=response.request.url,
                    callback=self.parse,
                    meta={'retry_count': retry_count + 1},
                    dont_filter=True
                )
                return
            else:
                # print(f"Failed to process {response.request.url} after {max_retries} retries.")
                yield {'type':'error', 'link': response.request.url}
                return 
        yield loaded_item

