#!/bin/bash

# Generates all 1000m x 1000m tile latitude-longitude pairs within Greater London
# and saves the coordinates in data/tile-coordinates.csv

min_lat=51.2868
max_lat=51.6919
min_long=-0.5103
max_long=0.3340

lat_step=0.009
long_step=0.0145

echo "latitude,longitude" > ../data/tile-coordinates.csv

lat=$min_lat
while (( $(echo "$lat <= $max_lat" | bc -l) )); do
  long=$min_long
  while (( $(echo "$long <= $max_long" | bc -l) )); do
    echo "$lat,$long" >> ../data/tile-coordinates.csv
    long=$(echo "$long + $long_step" | bc)
  done
  lat=$(echo "$lat + $lat_step" | bc)
done
