#!/bin/bash
CGAL_directory=$1
Input_data_folder=$2
Output_directory=$3
Num_threads=$4
Commit_hash=$5
Timeout=$6
shift 6

Current_directory=$(pwd)
Components=("$@")
if [ ${#Components[@]} -eq 0 ]; then
    Components=("Alpha_wrap_3" "Mesh_3" "Surface_mesh_simplification")
fi

declare -A COMPONENT_CONFIGS
COMPONENT_CONFIGS["Alpha_wrap_3,alpha"]="30"
COMPONENT_CONFIGS["Alpha_wrap_3,timeout"]="130"

Json_Output="$Output_directory/json_results"
Benchmark_Output="$Output_directory/benchmark_data"
mkdir -p "$Json_Output"
mkdir -p "$Benchmark_Output"

for component in "${Components[@]}"; do
    python3 "$Current_directory/process_benchmark_data.py" \
        --json-output "$Json_Output" \
        --output-dir "$Benchmark_Output" \
        --input-folder "$Input_data_folder" \
        --commit "$Commit_hash" \
        --component "$component" \
        --init-only
done

valid_extensions=(".off" ".obj" ".ply" ".stl" ".STL" ".ts" ".vtp")
all_files=()

while IFS= read -r -d '' file; do
    extension="${file##*.}"
    for valid_ext in "${valid_extensions[@]}"; do
        if [[ ".${extension,,}" == "${valid_ext,,}" ]]; then
            all_files+=("$file")
            break
        fi
    done
done < <(find "$Input_data_folder" -type f -print0)

echo "Found ${#all_files[@]} files for benchmarking."

for file in "${all_files[@]}"; do
    relative_path=$(realpath --relative-to="$Input_data_folder" "$file")
    echo "Processing: $relative_path"

    for component in "${Components[@]}"; do
        echo "  Component: $component"

        alpha_value=${COMPONENT_CONFIGS["$component,alpha"]:-"0"}
        timeout_value=${COMPONENT_CONFIGS["$component,timeout"]:-"60"}

        benchmark_script="$CGAL_directory/$component/benchmark/$component/benchmarking.sh"
        if [ -f "$benchmark_script" ]; then
            timeout $Timeout "$benchmark_script" \
                "$CGAL_directory" \
                "$file" \
                "$Benchmark_Output" \
                "$alpha_value" \
                "$timeout_value" \
                "$Num_threads" \
                "$Commit_hash" \
                --single-file

            python3 "$Current_directory/process_benchmark_data.py" \
                --json-output "$Json_Output" \
                --output-dir "$Benchmark_Output" \
                --input-file "$file" \
                --commit "$Commit_hash" \
                --component "$component" \
                --single-file
        else
            echo "  Benchmark script not found: $benchmark_script"
        fi
    done
done

echo "Benchmarking completed."