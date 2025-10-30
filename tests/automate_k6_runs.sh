#!/bin/bash

mkdir -p ./logs

declare -a scripts=(
  "k6_1_serverless_lambda_api_gateway.js"
  "k6_2_provisioned_lambda_api_gateway.js"
  "k6_3_serverless_lambda_no_api_gateway.js"
)
declare -a labels=(
  "serverless_lambda_api_gateway"
  "provisioned_lambda_api_gateway"
  "serverless_lambda_no_api_gateway"
)
ITERATIONS=5
TOTAL_RUNS=$((${#scripts[@]} * ITERATIONS))

function seconds_until_next_schedule() {
    current_min=$(date +%M)
    current_sec=$(date +%S)
    if [ "$current_min" -lt 25 ]; then
        sleep_seconds=$(( (25 - current_min)*60 - current_sec ))
    elif [ "$current_min" -lt 50 ]; then
        sleep_seconds=$(( (50 - current_min)*60 - current_sec ))
    else
        sleep_seconds=$(( (60 + 25 - current_min)*60 - current_sec ))
    fi
    echo $sleep_seconds
}

function log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') | $1"
}

sleep_seconds=$(seconds_until_next_schedule)
log "Waiting $sleep_seconds seconds until first scheduled run (next hh:25)..."
sleep $sleep_seconds

run_counts=(0 0 0)
# The script will run each k6 test script ITERATIONS times, spaced out at hh:25 and hh:50
# e.g.: 
# "k6_1_serverless_lambda_api_gateway.js" - 1: 09:25 
# "k6_1_serverless_lambda_api_gateway.js" - 2: 09:50 
# "k6_1_serverless_lambda_api_gateway.js" - 3: 10:25 
# "k6_1_serverless_lambda_api_gateway.js" - 4: 10:50 
# "k6_1_serverless_lambda_api_gateway.js" - 5: 11:25 
# "k6_2_provisioned_lambda_api_gateway.js" - 1: 11:50 
# "k6_2_provisioned_lambda_api_gateway.js" - 2: 12:25 
# "k6_2_provisioned_lambda_api_gateway.js" - 3: 12:50 
# "k6_2_provisioned_lambda_api_gateway.js" - 4: 13:25 
# "k6_2_provisioned_lambda_api_gateway.js" - 5: 13:50 
# "k6_3_serverless_lambda_no_api_gateway.js" - 1: 14:25 
# "k6_3_serverless_lambda_no_api_gateway.js" - 2: 14:50 
# "k6_3_serverless_lambda_no_api_gateway.js" - 3: 15:25 
# "k6_3_serverless_lambda_no_api_gateway.js" - 4: 15:50 
# "k6_3_serverless_lambda_no_api_gateway.js" - 5: 16:25

for ((global_run=0; global_run<TOTAL_RUNS; global_run++)); do
    for i in ${!scripts[@]}; do
        if [ ${run_counts[$i]} -lt $ITERATIONS ]; then
            script=${scripts[$i]}
            label=${labels[$i]}
            ((run_counts[$i]++))
            TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
            log "Run ${run_counts[$i]}/$ITERATIONS for $script ($label) at $TIMESTAMP"
            LOG_FILE="./logs/${label}_run_${TIMESTAMP}.log"
            dotenv k6 run "$script" > "$LOG_FILE" 2>&1
            log "Completed run ${run_counts[$i]}/$ITERATIONS for $label | Output logged to $LOG_FILE"
            break
        fi
    done

    # Sleep until next scheduled slot unless it's the last run
    if ((global_run < TOTAL_RUNS - 1)); then
        sleep_seconds=$(seconds_until_next_schedule)
        log "Sleeping $sleep_seconds seconds until next scheduled run..."
        sleep $sleep_seconds
    fi
done

log "=== All tests completed ==="
