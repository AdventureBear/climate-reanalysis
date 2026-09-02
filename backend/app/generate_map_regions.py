from app.config import REGIONS
from app.visualizer import describe_region_catalog


def get_regions():
    return describe_region_catalog(REGIONS)


