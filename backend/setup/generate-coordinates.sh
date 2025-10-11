#!/bin/bash

# Generates exactly 150 tiles within Greater London
# and saves the coordinates in data/tile-coordinates.csv

min_lat=51.2868
max_lat=51.6919
min_long=-0.5103
max_long=0.3340

rows=15
cols=10

output_file="../data/tile-coordinates/tile-coordinates.csv"

echo "id,latitude,longitude" > $output_file

id=1
for i in $(seq 0 $((rows-1))); do
    lat=$(echo "$min_lat + $i*($max_lat - $min_lat)/($rows-1)" | bc -l)
    for j in $(seq 0 $((cols-1))); do
        lon=$(echo "$min_long + $j*($max_long - $min_long)/($cols-1)" | bc -l)
        # Format lat/lon with leading zero
        lat_fmt=$(printf "%.4f" "$lat")
        lon_fmt=$(printf "%.4f" "$lon")
        echo "$id,$lat_fmt,$lon_fmt" >> $output_file
        id=$((id+1))
    done
done
