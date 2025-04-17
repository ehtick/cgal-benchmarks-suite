#!/bin/bash
Output_directory=$1
Num_threads=$2

MAX_THREADS_PER_CONTAINER=6
CONFIG_FILE=$(dirname "$0")/component_config.json
TEMP_DIR=""

get_datetime() {
    date '+%Y-%m-%d %H:%M:%S'
}

setup_temp_directories() {
    TEMP_DIR=$(mktemp -d "/tmp/cgal-benchmark-$(date +%Y%m%d-%H%M%S)-XXXXXX")
    chmod 777 "$TEMP_DIR"
    echo "Created temporary directory at: $TEMP_DIR"
}

setup_component_directories() {
    local component=$1
    mkdir -p "$TEMP_DIR/$component/logs"
    mkdir -p "$TEMP_DIR/$component/benchmark_output"
    mkdir -p "$TEMP_DIR/$component/json_results"
}

move_component_results() {
    local component=$1
    local component_temp_dir="$TEMP_DIR/$component"

    mkdir -p "$Output_directory/logs/$component" "$Output_directory/json_results/$component" "$Output_directory/benchmark_output/$component"

    if [ -d "$component_temp_dir" ]; then
        echo "Moving results for component $component"

        # Move logs
        if [ -d "$component_temp_dir/logs" ] && [ "$(ls -A $component_temp_dir/logs)" ]; then
            mv "$component_temp_dir/logs/"* "$Output_directory/logs/$component/"
        fi

        # Move benchmark output
        if [ -d "$component_temp_dir/benchmark_output" ] && [ "$(ls -A $component_temp_dir/benchmark_output)" ]; then
            mv "$component_temp_dir/results/"* "$Output_directory/benchmark_output/$component/"
        fi

        # Move JSON results
        if [ -d "$component_temp_dir/json_results" ] && [ "$(ls -A $component_temp_dir/json_results)" ]; then
            mv "$component_temp_dir/json_results/"* "$Output_directory/json_results/$component/"
        fi

        rm -rf "$component_temp_dir"
    fi
}

build_docker_image() {
    local dockerfile_dir=$(dirname "$0")
    echo "Building Docker image..."
    docker build --force-rm -t cgal-benchmark "$dockerfile_dir" || {
        echo "Error: Failed to build Docker image"
        exit 1
    }
    echo "Docker image built successfully"
}

run_component_benchmark() {
    local component=$1
    local datasets=$2
    local script="scripts/$3"
    local arguments=$4
    local threads=$5

    setup_component_directories "$component"

    # Prepare volume mounts for datasets
    local volume_mounts=""
    IFS=',' read -ra DATASETS_ARRAY <<< "$datasets"
    for dataset in "${DATASETS_ARRAY[@]}"; do
        # Extract the base name of the dataset path (e.g., "Thingi10k" from "/path/to/Data/Thingi10k")
        local dataset_name=$(basename "$dataset")
        volume_mounts+=" -v $dataset:/app/data/$dataset_name:ro"
    done

    echo ">>> Starting benchmark for $component with $threads threads"
    docker run -d --rm --replace \
        --name "cgal-benchmark-$component" \
        -v "$TEMP_DIR/$component:/app/benchmark:z" \
        $volume_mounts \
        -e COMPONENT="$component" \
        -e THREADS="$threads" \
        cgal-benchmark /bin/bash -c "$script"
}

get_components() {
    jq -r 'keys[]' "$CONFIG_FILE"
}

launch_parallel_benchmarks() {
    local components=("$@")
    local index=0
    declare -A running_containers
    declare -A thread_map

    while [ $index -lt ${#components[@]} ] || [ ${#running_containers[@]} -gt 0 ]; do
        for component in "${!running_containers[@]}"; do
            if ! docker ps -q --filter "name=cgal-benchmark-$component" | grep -q .; then
                echo "[INFO] Container for $component finished"
                threads_used=${thread_map["$component"]}
                total_threads_used=$((total_threads_used - threads_used))
                unset running_containers["$component"]
                unset thread_map["$component"]
                move_component_results "$component"
            fi
        done

        total_threads_used=0
        for val in "${thread_map[@]}"; do
            total_threads_used=$((total_threads_used + val))
        done
        threads_available=$((Num_threads - total_threads_used))

        while [ $index -lt ${#components[@]} ] && [ $threads_available -ge 1 ]; do
            component="${components[$index]}"
            remaining_components=$(( ${#components[@]} - index ))

            if [ $remaining_components -eq 1 ]; then
                threads_for_this=$threads_available
            elif [ $remaining_components -eq 2 ]; then
                threads_for_this=$(( threads_available / 2 ))
                if [ $((threads_available % 2)) -eq 1 ]; then
                    threads_for_this=$((threads_for_this + 1))
                fi
            else
                threads_for_this=$(( threads_available < MAX_THREADS_PER_CONTAINER ? threads_available : MAX_THREADS_PER_CONTAINER ))
            fi

            if [ $threads_for_this -lt 1 ]; then
                break
            fi

            launch_container "$component" "$threads_for_this"
            running_containers["$component"]=1
            thread_map["$component"]=$threads_for_this
            threads_available=$((threads_available - threads_for_this))
            ((index++))
        done

        sleep 5
    done
}

launch_container() {
    local component=$1
    local threads=$2
    local datasets=$(jq -r ".[\"$component\"].datasets[]" "$CONFIG_FILE" | tr '\n' ',')
    local script=$(jq -r ".[\"$component\"].scripts" "$CONFIG_FILE")
    local arguments=$(jq -r ".[\"$component\"].arguments[0]" "$CONFIG_FILE")

    run_component_benchmark "$component" "$datasets" "$script" "$arguments" "$threads"
    echo "Started container for $component"
}

main() {
    if [ $# -ne 2 ]; then
        echo "Usage: $0 Output_directory Num_threads"
        exit 1
    fi

    if [ ! -d "$Output_directory" ]; then
        mkdir -p "$Output_directory"
    fi

    if ! [[ "$Num_threads" =~ ^[0-9]+$ ]]; then
        echo "Error: Number of threads must be a positive integer"
        exit 1
    fi

    if [ ! -d "$Output_directory/logs" ]; then
        mkdir -p "$Output_directory/logs"
    fi

    if [ ! -d "$Output_directory/json_results" ]; then
        mkdir -p "$Output_directory/json_results"
    fi

    setup_temp_directories

    start_datetime=$(get_datetime)
    echo "=== [ BENCHMARK LAUNCH ] ==="
    echo "Datetime              : $start_datetime"
    echo "Output directory      : $Output_directory"
    echo "Temporary directory   : $TEMP_DIR"
    echo "Threads               : $Num_threads"
    echo "Config file           : $CONFIG_FILE"
    echo "---------------------------------------"

    build_docker_image

    local components=($(get_components))
    echo "=== [CONTAINERS LAUNCH] ==="
    echo "Found ${#components[@]} components to benchmark"
    echo "---------------------------------------"

    launch_parallel_benchmarks "${components[@]}"

    echo "All benchmarks completed"
}

main "$@"