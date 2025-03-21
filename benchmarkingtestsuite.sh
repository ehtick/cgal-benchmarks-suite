#!/bin/bash
CGAL_directory=$1
Input_data_folder=$2
Output_directory=$3
Num_threads=$4
Commit_hash=$5
Timeout=$6
shift 6

Current_directory="/app/scripts"
Components=("$@")
if [ ${#Components[@]} -eq 0 ]; then
    Components=("Alpha_wrap_3" "Mesh_3" "Surface_mesh_simplification")
fi

for component in "${Components[@]}"; do
    BUILD_DIR="/app/build/$component"
    
    if [ ! -f "$BUILD_DIR/robustness_benchmark" ] && [ -d "$CGAL_directory/$component/benchmark/$component" ]; then
        echo "Compiling $component benchmarks..."
        mkdir -p $BUILD_DIR
        cd $BUILD_DIR
        
        if [ -f "$CGAL_directory/$component/benchmark/$component/CMakeLists.txt" ]; then
            cmake $CGAL_directory/$component/benchmark/$component -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=$CGAL_directory
            make -j $(nproc)
            
            if [ $? -ne 0 ]; then
                echo "Error compiling benchmarks for $component"
                continue
            fi
            echo "Compilation completed for $component."
        else
            echo "No CMakeLists.txt found for $component. Skipping compilation."
        fi
    fi
done

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

        benchmark_script="$CGAL_directory/$component/benchmark/$component/benchmarking_${component}.sh"

        if [ ! -f "$benchmark_script" ]; then
            echo "  Benchmark script not found: $benchmark_script. Skipping."
            continue
        fi

        echo "  Running benchmark script: $benchmark_script"

        export BUILD_DIR="/app/build/$component"
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
            --input-folder "$Input_data_folder" \
            --commit "$Commit_hash" \
            --component "$component" \
            --single-file
    done
done

echo "Benchmarking completed."