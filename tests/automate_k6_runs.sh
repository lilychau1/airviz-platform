#!/bin/bash

# Ensure logs directory exists
mkdir -p ./logs

# All scripts to run tests
declare -a scripts=(
    "k6_1_serverless_lambda_api_gateway.js"
    "k6_2_provisioned_lambda_api_gateway.js"
    "k6_3_serverless_lambda_no_api_gateway.js"
)

# Corresponding labels for logs
declare -a labels=(
    "serverless_lambda_api_gateway"
    "provisioned_lambda_api_gateway"
    "serverless_lambda_no_api_gateway"
)

# Number of iterations per script
ITERATIONS=5

# Function to calculate seconds until next hh:25 or hh:50
seconds_until_next_schedule() {
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

# Function to echo with timestamp
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') | $1"
}

# Wait until first scheduled run (next hh:25)
sleep_seconds=$(seconds_until_next_schedule)
log "Waiting $sleep_seconds seconds until first scheduled run (next hh:25)..."
sleep $sleep_seconds

# Main loop
for i in ${!scripts[@]}; do
    script=${scripts[$i]}
    label=${labels[$i]}
    log "=== Starting tests for $script ($label) ==="

    for ((run=1; run<=ITERATIONS; run++)); do
        # Current timestamp for filename and logging
        TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
        log "Run $run/$ITERATIONS at $TIMESTAMP"

        # Log filename includes label + timestamp
        LOG_FILE="./logs/${label}_run_${TIMESTAMP}.log"

        # Run k6 with dotenv and log output
        dotenv k6 run "$script" > "$LOG_FILE" 2>&1

        log "Completed run $run/$ITERATIONS for $label | Output logged to $LOG_FILE"

        # Wait until next scheduled hh:25 or hh:50 for next run
        if [ $run -lt $ITERATIONS ]; then
            sleep_seconds=$(seconds_until_next_schedule)
            log "Sleeping $sleep_seconds seconds until next scheduled run..."
            sleep $sleep_seconds
        fi
    done

    log "=== Completed all runs for $label ==="
done

log "=== All tests completed ==="
