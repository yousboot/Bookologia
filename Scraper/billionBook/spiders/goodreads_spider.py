import scrapy
from .author_spider import AuthorSpider
from .book_spider import BookSpider
from ..items import BookItem, BookLoader
import random 

class GoodreadsSpider(scrapy.Spider):
    name = "goodreads"
    
    def __init__(self, start_id=1, end_id=10, *args, **kwargs):
        self.start_id = start_id
        self.end_id = end_id
        super().__init__(**kwargs)
        self.book_spider = BookSpider()
        super(GoodreadsSpider, self).__init__(*args, **kwargs)
        self.start_urls = [f"https://www.goodreads.com/book/show/{i}" for i in range(int(start_id), int(end_id) + 1)]

    def parse(self, response):
        yield response.follow(response.url, callback=self.book_spider.parse)
        
