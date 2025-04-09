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
echo "CGAL directory     : $CGAL_directory"
echo "Input data folder  : $Input_data_folder"
echo "Output directory   : $Output_directory"
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

echo "=== [BENCHMARK LOOP - PARALLEL MODE] ==="

for component in "${Components[@]}"; do
    check_stop
    echo "--- Component: $component ---"

    datasets=()
    if [[ -n "${ComponentDatasets[$component]}" ]]; then
        IFS=' ' read -r -a datasets <<<"${ComponentDatasets[$component]}"
    else
        datasets=(".")
    fi

    for dataset in "${datasets[@]}"; do
        check_stop
        dataset_path="$Input_data_folder/$dataset"
        echo ">>> Dataset: $dataset_path"

        mapfile -d '' -t all_files < <(find "$dataset_path" -type f -print0)
        echo "Found ${#all_files[@]} files in dataset."

        export CGAL_directory Benchmark_Output Timeout Num_threads Input_data_folder \
            Json_Output Current_directory component alpha_value timeout_value FIX_SELINUX \
            benchmark_script

        benchmark_script="/app/scripts/benchmarking_${component}.sh"
        alpha_value=${COMPONENT_CONFIGS["$component,alpha"]:-"0"}
        timeout_value=${COMPONENT_CONFIGS["$component,timeout"]:-"60"}

        parallel -j "$Num_threads" --line-buffer '
            file="{}"
            extension="${file##*.}"
            valid=0
            for ext in .off .obj .ply .stl .STL .ts .vtp; do
                if [[ ".${extension,,}" == "${ext,,}" ]]; then
                    valid=1
                    break
                fi
            done
            [ $valid -eq 0 ] && exit 0

            relative_path=$(realpath --relative-to="$Input_data_folder" "$file")
            echo "[PID $$] >>> Processing $relative_path" >&2

            timeout "$Timeout" "$benchmark_script" \
                "$CGAL_directory" \
                "$file" \
                "$Benchmark_Output" \
                "$alpha_value" \
                "$timeout_value" \
                "$Num_threads" \
                --single-file

            if [ $? -ne 0 ]; then
                echo "[PID $$] !!! Benchmark failed for $relative_path" >&2
            fi

            python3 "$Current_directory/process_benchmark_data.py" \
                --json-output "$Json_Output" \
                --output-dir "$Benchmark_Output" \
                --input-file "$file" \
                --input-folder "$Input_data_folder" \
                --component "$component" \
                --single-file

            if [ $? -ne 0 ]; then
                echo "[PID $$] !!! Post-processing failed for $relative_path" >&2
            fi

            if [ -f "$FIX_SELINUX" ]; then
                bash "$FIX_SELINUX" "$Json_Output"
                bash "$FIX_SELINUX" "$Benchmark_Output"
            fi

            echo "[PID $$] Done with $relative_path" >&2
        ' ::: "${all_files[@]}"
    done
    output_file="$Json_Output/${component}_results_$(date '+%Y-%m-%d').json"
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    jq --arg finished_at "$timestamp" '.finished_at = $finished_at' "$output_file" > "${output_file}.tmp" && mv "${output_file}.tmp" "$output_file"
done

cleanup