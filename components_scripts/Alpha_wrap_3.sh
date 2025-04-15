#!/bin/bash
component=$COMPONENT
threads=$THREADS
CGAL_directory="/app/CGAL"
Component_directory="$CGAL_directory/Alpha_wrap_3/benchmark/Alpha_wrap_3"

echo "=== [ BENCHMARK LAUNCH for $component ] ==="
echo "Component          : $component"
echo "Threads            : $threads"
echo "---------------------------------------"


echo "=== [ SETUP CGAL ] ==="
echo "Cloning CGAL repository..."
git clone -b testsuite-benchmarking https://github.com/SaillantNicolas/cgal.git /app/CGAL
if [ $? -ne 0 ]; then
    echo "Error: Failed to clone CGAL repository"
    exit 1
fi
echo "CGAL repository cloned successfully"

echo "=== [ COMPILATION STEP ] ==="
BUILD_DIR="$Component_directory/build-release"

if [ ! -f "$BUILD_DIR/robustness_benchmark" ] && [ -d "$Component_directory" ]; then
    echo "-> Compiling benchmarks for $component"
    mkdir -p "$BUILD_DIR"
    cd "$BUILD_DIR"

    if [ -f "$Component_directory/CMakeLists.txt" ]; then
        cmake "$Component_directory" \
            -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$CGAL_directory"
        make -j $threads

        if [ $? -ne 0 ]; then
            echo "Error: Compilation failed for $component"
            continue
        fi
        echo "Compilation done for $component"
    else
        echo "No CMakeLists.txt for $component. Skipping."
    fi
else
    echo "Benchmarks already compiled for $component"
fi

valid_extensions=(".off" ".obj" ".ply" ".stl" ".STL" ".ts" ".vtp")

echo "=== [ BENCHMARK LOOP - PARALLEL MODE ] ==="

input_path="/app/data/"
output_dir="/app/benchmark/results/Alpha_wrap_3"
alpha_value=0.5
timeout_value=60
virtual_thread=$threads

BENCHMARK_SCRIPT="$Component_directory/benchmarking.sh"

if [ -f "$BENCHMARK_SCRIPT" ]; then
    echo "Launching Alpha_wrap_3 benchmark script..."

    bash "$BENCHMARK_SCRIPT" "$CGAL_directory" "$input_path/ovhData/Adalisk" "$output_dir" \
        "$alpha_value" "$timeout_value" "$virtual_thread" "a"

    if [ $? -ne 0 ]; then
        echo "Error: Alpha_wrap_3 benchmark script failed."
        exit 1
    fi
    echo "Alpha_wrap_3 benchmarks completed successfully."

    echo "=== [ GENERATING METRICS JSON ] ==="
    python3 "/app/scripts/Alpha_wrap_3/Alpha_wrap_3_processor.py" \
        --json-output "/app/benchmark/json_results/Alpha_wrap_3_results.json" \
        --output-dir "$output_dir" \
        --input-folder "$input_path/ovhData/Adalisk"

    chmod -R go+rw "/app/benchmark"
else
    echo "Error: Benchmark script not found at $BENCHMARK_SCRIPT"
    exit 1
fi
