from elasticsearch import Elasticsearch
import certifi
from .config import ELASTICSEARCH_PROD_URL, ELASTICSEARCH_PROD_PORT

class DatabaseConnector:
    def __init__(self, environment):
        self.environment = environment
        self.connection = None

    def connect(self):
        if self.environment == "prod":
            es_url = ELASTICSEARCH_PROD_URL
        else:
            raise ValueError("Invalid environment. Supported environments: prod")

        self.connection = Elasticsearch([es_url], verify_certs=False, timeout=120)
