# CGAL Benchmarking

To add the benchmark section for your component, follow the guidelines below to structure your files and implement the necessary scripts.

## Directory Structure

```
ComponentName/
├── benchmark/
│   ├──ComponentName/
│   │  ├── Performance/
│   │  │   ├── log/               # Logs for performance benchmarks
│   │  │   └── results/           # Raw results for performance benchmarks
│   │  ├── Quality/
│   │  │   ├── log/               # Logs for quality benchmarks
│   │  │   └── results/           # Raw results for quality benchmarks
│   │  └── Robustness/
│   │      ├── log/               # Logs for robustness benchmarks
│   │      └── results/           # Raw results for robustness benchmarks
```

### Explanation of Subdirectories

- **log/**: Stores detailed logs for each benchmark run, categorized by type (Performance, Quality, Robustness).
- **results/**: Contains raw benchmark results, typically organized by input data or execution date.

### Note on Scripts

The appropriate scripts for running benchmarks and processing data should be placed in the relevant subdirectories (e.g., `Performance/`, `Quality/`, `Robustness/`) as needed. These scripts can be implemented in any language or format suitable for the component being benchmarked.

## Benchmarking Process
Run the component with a set of input files.
1. **Performance Benchmark**:
  - Measure time and memory usage.
  - Store results in `Performance/results/`.
    - Each input file generates a corresponding results file in the `results` directory. For example, running the benchmark on `34784.obj` will create a file `Performance/results/34784.txt` containing:
      ```
      0.21
      17332
      ```
      where:
      - The first line represents the execution time in seconds.
      - The second line represents the memory usage in KB.
  - Log details in `Performance/log/`.
2. **Robustness Benchmark**:
  - Check exit codes.
  - Store results in `Robustness/results/`.
    - Each input file generates a corresponding results file in the `results` directory.
  - Log details in `Robustness/log/`.
3. **Quality Benchmark**:
  - Measure quality metrics.
  - Store results in `Quality/results/`.
    - Each input file generates a corresponding results file in the `results` directory.
  - Log details in `Quality/log/`.

## Script Parameters

The benchmarking scripts accept the following parameters:

1. **Project Directory**: Path to the directory containing the project
2. **Input Data Directory**: Path to the directory containing the input data files.
3. **Output Results Directory**: Path to the directory where the benchmark results will be stored.
4. **Timeout**: Timeout value for the robustness benchmark (in seconds).
5. **Number of Threads**: Number of virtual threads to use for the benchmark.
6. **Component-Specific Parameter**: A parameter specific to the component being benchmarked. For example:
   - **Alpha Value**: Used for components like `Alpha_wrap_3` to define the alpha parameter.
   - Other components may require different parameters.

## Benchmark Details

### Performance Benchmark
- Measures:
    - Execution time (seconds)
    - Memory usage (KB)
- Results are stored in files in the `Performance/results/` directory, with one file per input data file.

### Robustness Benchmark
Exit codes :
```
0: VALID_OUTPUT
1: INPUT_INVALID
2-9: Various failure modes
10-13: Runtime errors/timeouts
```

Example for `Alpha_wrap_3`:
```
0: VALID_SOLID_OUTPUT
1: INPUT_IS_INVALID
2: OUTPUT_IS_NOT_TRIANGLE_MESH
3: OUTPUT_IS_COMBINATORIAL_NON_MANIFOLD
4: OUTPUT_HAS_BORDERS
5: OUTPUT_HAS_DEGENERATED_FACES
6: OUTPUT_HAS_GEOMETRIC_SELF_INTERSECTIONS
7: OUTPUT_DOES_NOT_BOUND_VOLUME
8: OUTPUT_DOES_NOT_CONTAIN_INPUT
9: OUTPUT_DISTANCE_IS_TOO_LARGE
10: SIGSEGV
11: SIGABRT
12: SIGFPE
13: TIMEOUT
```

### Quality Benchmark
- Metrics (Depend on component)

Example for `Alpha_wrap_3`:

```
"Mean_Min_Angle_(degree)"
"Mean_Max_Angle_(degree)"
"Mean_Radius_Ratio"
"Mean_Edge_Ratio"
"Mean_Aspect_Ratio"
"Complexity_(#_of_triangle)"
"#_of_almost_degenerate_triangle"
"Hausdorff_distance_output_to_input_(%_of_bbox_diag)"
```

## Example Benchmark for Alpha Wrap

For a functional example of a benchmark implementation, refer to the [Alpha Wrap Benchmark](https://github.com/CGAL/cgal/tree/master/Alpha_wrap_3/benchmark/Alpha_wrap_3).