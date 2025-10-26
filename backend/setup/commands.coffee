# Setup commands for AirViz backend
# tile coordinates generation
cd backend/setup/
./generate-coordinates.sh 

# attach boroughs to tile coordinates
poetry install
python attach-boroughs-to-tile-coordinates.py

# API calls for testing

curl -X POST https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/createDbSchema

curl -X POST https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/ingestAqData

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/aggregateRegionalMetrics" \
     -H "Content-Type: application/json" \
     -d '{
           "level": "borough"
         }'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchPopupInformation" \
  -H "Content-Type: application/json" \
  -d '{"level": "borough", "id": 1}'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchPopupInformation" \
  -H "Content-Type: application/json" \
  -d '{"level": "tile", "id": 1}'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchPollutantData" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "tile",
    "id": 42,
    "selectedTimestampPeriod": {
      "start": 1759276800000,
      "end": 1761888000000
    }
  }'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchPollutantData" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "borough",
    "id": 1,
    "selectedTimestampPeriod": {
      "start": 1759276800000,
      "end": 1761888000000
    }
  }'
# "2025-10-01T00:00:00Z
# "2025-10-30T00:00:00Z

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchAqiData" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "tile",
    "id": 1,
    "selectedTimestampPeriod": {
      "start": 1759276800000,
      "end": 1761888000000
    }
  }'


curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchAqiData" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "borough",
    "id": 1,
    "selectedTimestampPeriod": {
      "start": 1759276800000,
      "end": 1761888000000
    }
  }'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchAllRegions" \
     -H "Content-Type: application/json" \
     -d '{
           "level": "borough",
           "currentLongitude": -0.101923,
           "currentLatitude": 51.503758,
           "radius": 4,
           "timestamp": 1759692180000
         }'
# "timestamp": 1759672800000  # 2025-10-05 14:00:00 UTC
# "timestamp": 1759692180000  # 2025-10-05 19:23:00 UTC
  
curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchAllRegions" \
     -H "Content-Type: application/json" \
     -d '{
           "level": "tile",
           "currentLongitude": -0.101923,
           "currentLatitude": 51.503758,
           "radius": 1,
           "timestamp": 1759681380000
         }'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchAqiData" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "borough",
    "id": 1,
    "selectedTimestampPeriod": {
      "start": "2025-10-01T00:00:00Z",
      "end": "2025-10-30T00:00:00Z"
    }
  }'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchCurrentAirQualityInfo" \
  -H "Content-Type: application/json" \
  -d '{"level": "borough", "id": 1}'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchCurrentAirQualityInfo" \
  -H "Content-Type: application/json" \
  -d '{"level": "tile", "id": 1}'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchDetails" \
  -H "Content-Type: application/json" \
  -d '{"level": "borough", "id": 1}'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchDetails" \
  -H "Content-Type: application/json" \
  -d '{"level": "tile", "id": 1}'

curl -X POST "https://iklfsbywzk.execute-api.eu-west-2.amazonaws.com/fetchTileHealthRecommendations" \
  -H "Content-Type: application/json" \
  -d '{"tileId": 1}'

# lambda URL test
# fetchPopupInformationFunction
curl -X POST "https://cxeros2koqhmztbz6ua3ezo62q0sfnst.lambda-url.eu-west-2.on.aws/" \
  -H "Content-Type: application/json" \
  -d '{"level": "borough", "id": 1}'

# fetchAllRegionsFunction
# https://gcs3gq3wfvayaxjon7xhzpvq240kkfoo.lambda-url.eu-west-2.on.aws/

# fetchPollutantDataFunction
# https://6nwwkdag6obmcrfod5bceiqbkm0wyocf.lambda-url.eu-west-2.on.aws/

# fetchCurrentAirQualityInfoFunction
# https://n6qxjr5l6xwotvaraomvcvr6ga0yohrq.lambda-url.eu-west-2.on.aws/

# fetchTileHealthRecommendationsFunction
# https://33ggzvl5hdvue6bnjj5fo3gkh40ostue.lambda-url.eu-west-2.on.aws/

# fetchAqiDataFunction
# https://iwv5xs6tz23gt5vhooewfsgbrq0txrkr.lambda-url.eu-west-2.on.aws/

# fetchPopupInformationFunction
# https://cxeros2koqhmztbz6ua3ezo62q0sfnst.lambda-url.eu-west-2.on.aws/

# fetchDetailsFunction
# https://pgazwhjp3rqrhfddpgf66jfpju0bdjvb.lambda-url.eu-west-2.on.aws/

# Connect to the PostgreSQL database
psql -h datastoragestack-airvizrds74c12fed-o9mgl2tch08a.cv4cc6au2bzg.eu-west-2.rds.amazonaws.com -U airvizAdmin -d airviz -p 5432

# Run k6
cd ../tests/
tmux new -s k6_test
./automate_k6_runs.sh 

# dotenv k6 run k6_1_serverless_lambda_api_gateway.js --out json=./logs/k6_run.json
# dotenv k6 run k6_2_provisioned_lambda_api_gateway.js --out json=./logs/k6_run.json
# dotenv k6 run k6_3_serverless_lambda_no_api_gateway.js --out json=./logs/k6_run.json
