#!/bin/bash
CGAL_directory=$1
Input_data_folder=$2
Output_directory=$3
Num_threads=$4
Timeout=$5
shift 5

Current_directory="/app/scripts"
STOP_FILE="/app/benchmark/stop_signal"
RUNNING_FILE="/app/benchmark/running"
FIX_SELINUX="/app/scripts/set_selinux_context.sh"

cleanup() {
    echo "Cleaning up..."
    rm -f "$RUNNING_FILE"
    if [ -f "$FIX_SELINUX" ]; then
        bash "$FIX_SELINUX" "$Json_Output"
        bash "$FIX_SELINUX" "$Benchmark_Output"
    fi
    exit 0
}
check_stop() {
    if [ -f "$STOP_FILE" ]; then
        echo "Stop signal detected, clean shutdown..."
        cleanup
    fi
}
trap cleanup SIGTERM SIGINT
rm -f "$STOP_FILE"
touch "$RUNNING_FILE"

echo "=== [BENCHMARK LAUNCH] ==="
echo "CGAL directory     : $1"
echo "Input data folder  : $2"
echo "Output directory   : $3"
echo "Threads            : $Num_threads"
echo "Timeout            : $Timeout"
echo "---------------------------------------"

if [[ "$1" == *.json ]]; then
    echo ">> Mode: CONFIG FILE detected: $1"
    Config_file="$1"
    Components=()
    declare -A ComponentDatasets

    mapfile -t Components < <(jq -r 'keys[]' "$Config_file")

    echo ">> Components from config: ${Components[*]}"

    for component in "${Components[@]}"; do
        mapfile -t datasets < <(jq -r --arg comp "$component" '.[$comp].datasets[]' "$Config_file")
        echo "   ↳ $component -> ${datasets[*]}"
        ComponentDatasets["$component"]="${datasets[*]}"
    done
else
    echo ">> Mode: MANUAL component list"
    Components=("$@")
    echo ">> Components: ${Components[*]}"
fi

echo "=== [COMPILATION STEP] ==="

for component in "${Components[@]}"; do
    BUILD_DIR="/app/build/$component"

    if [ ! -f "$BUILD_DIR/robustness_benchmark" ] && [ -d "$CGAL_directory/$component/benchmark/$component" ]; then
        echo "-> Compiling benchmarks for $component"
        mkdir -p "$BUILD_DIR"
        cd "$BUILD_DIR"

        if [ -f "$CGAL_directory/$component/benchmark/$component/CMakeLists.txt" ]; then
            cmake "$CGAL_directory/$component/benchmark/$component" \
                -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$CGAL_directory"
            make -j $(nproc)

            if [ $? -ne 0 ]; then
                echo "!! Compilation failed for $component"
                continue
            fi
            echo "Compilation OK for $component"
        else
            echo "!! No CMakeLists.txt for $component. Skipping."
        fi
    else
        echo "Benchmarks already compiled or not needed for $component"
    fi
done

declare -A COMPONENT_CONFIGS
COMPONENT_CONFIGS["Alpha_wrap_3,alpha"]="30"
COMPONENT_CONFIGS["Alpha_wrap_3,timeout"]="130"

Json_Output="$Output_directory/json_results"
Benchmark_Output="$Output_directory/benchmark_data"
mkdir -p "$Json_Output"
mkdir -p "$Benchmark_Output"

echo "=== [INITIALIZE JSON OUTPUTS] ==="

for component in "${Components[@]}"; do
    echo "-> Initializing JSON for $component"
    python3 "$Current_directory/process_benchmark_data.py" \
        --json-output "$Json_Output" \
        --output-dir "$Benchmark_Output" \
        --input-folder "$Input_data_folder" \
        --component "$component" \
        --init-only

    if [ -f "$FIX_SELINUX" ]; then
        bash "$FIX_SELINUX" "$Json_Output"
        bash "$FIX_SELINUX" "$Benchmark_Output"
    fi
done

valid_extensions=(".off" ".obj" ".ply" ".stl" ".STL" ".ts" ".vtp")

echo "=== [BENCHMARK LOOP] ==="

for component in "${Components[@]}"; do
    check_stop
    echo "--- Component: $component ---"

    datasets=()
    if [[ -n "${ComponentDatasets[$component]}" ]]; then
        IFS=' ' read -r -a datasets <<< "${ComponentDatasets[$component]}"
    else
        datasets=(".")
    fi

    for dataset in "${datasets[@]}"; do
        check_stop
        dataset_path="$Input_data_folder/$dataset"
        echo ">>> Dataset: $dataset_path"

        mapfile -d '' -t all_files < <(find "$dataset_path" -type f -print0)
        echo "Found ${#all_files[@]} files in dataset."

        for file in "${all_files[@]}"; do
            check_stop
            extension="${file##*.}"
            match=0
            for valid_ext in "${valid_extensions[@]}"; do
                if [[ ".${extension,,}" == "${valid_ext,,}" ]]; then
                    match=1
                    break
                fi
            done
            [ $match -eq 0 ] && continue

            relative_path=$(realpath --relative-to="$Input_data_folder" "$file")
            echo "Processing file: $relative_path"

            alpha_value=${COMPONENT_CONFIGS["$component,alpha"]:-"0"}
            timeout_value=${COMPONENT_CONFIGS["$component,timeout"]:-"60"}

            benchmark_script="/app/scripts/benchmarking_${component}.sh"
            if [ ! -f "$benchmark_script" ]; then
                echo "!! Benchmark script not found: $benchmark_script. Skipping."
                continue
            fi

            echo ">>> Running $benchmark_script"
            export BUILD_DIR="/app/build/$component"

            timeout "$Timeout" "$benchmark_script" \
                "$CGAL_directory" \
                "$file" \
                "$Benchmark_Output" \
                "$alpha_value" \
                "$timeout_value" \
                "$Num_threads" \
                --single-file

            echo ">>> Collecting metrics for $component"

            python3 "$Current_directory/process_benchmark_data.py" \
                --json-output "$Json_Output" \
                --output-dir "$Benchmark_Output" \
                --input-file "$file" \
                --input-folder "$Input_data_folder" \
                --component "$component" \
                --single-file

            if [ -f "$FIX_SELINUX" ]; then
                bash "$FIX_SELINUX" "$Json_Output"
                bash "$FIX_SELINUX" "$Benchmark_Output"
            fi
        done
    done
done

cleanup