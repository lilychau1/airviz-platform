import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

# Load borough polygons
boroughs = gpd.read_file('../../frontend/airviz/public/data/map-region-boundrary-json/borough.geojson')

# Load CSV points
df_points = pd.read_csv('../data/tile-coordinates/tile-coordinates.csv')

# Create geometry column
geometry = [Point(xy) for xy in zip(df_points['longitude'], df_points['latitude'])]
points = gpd.GeoDataFrame(df_points, geometry=geometry, crs='EPSG:4326')  # WGS84

boroughs = boroughs.to_crs(points.crs)

# Find borough polygon containing each point
joined = gpd.sjoin(points, boroughs[['fid', 'geometry']], how='left', predicate='within')

# Add new column 'fid' with the borough ID
joined = gpd.sjoin(points, boroughs[['fid', 'geometry']], how='left', predicate='within')
joined = joined.drop(columns=['index_right', 'geometry'])
joined_non_null = joined[joined['fid'].notnull()]

# Reset id sequentially after removing nulls
joined_non_null.reset_index(drop=True, inplace=True)
joined_non_null.loc[:, 'id'] = joined_non_null.index + 1
# Rename fid to boroughId
joined_non_null.rename(columns={'fid': 'boroughId'}, inplace=True)

# Save file
joined_non_null.to_csv('../data/tile-coordinates/tile-coordinates-with-boroughid.csv', index=False)
