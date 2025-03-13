# CGAL Benchmarking

## Script
Create `benchmarking.sh` to orchestrate the entire process.

## Directory Structure

```
ComponentName/
├── benchmark/
│   ├── build-release/        # Compiled executables
│   ├── Performance/
│   │   ├── log/              # Logs
│   │   └── results/          # Raw results
│   ├── Robustness/           # Similar structure
│   ├── Quality/              # Similar structure
│   └── benchmarking.sh       # Main script
```

## Benchmark Details

### Performance Benchmark
- Measures: time (seconds), Memory usage (KB)

### Robustness Benchmark
- Exit codes for different failure modes:
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

### Script
```bash
#!/bin/bash
# $1: directory containing the component project
# $2: directory containing the input data folder
# $3: directory containing the output results
# $4: timeout value for robustness benchmark in seconds
# $5: number of virtual thread used
# $6: hash of the latest commit
# $* : component specific arguments

cd $1

mkdir -p $3/Robustness/results/$6
mkdir -p $3/Performance/results/$6
mkdir -p $3/Quality/results/$6
mkdir -p $3/Robustness/log
mkdir -p $3/Performance/log
mkdir -p $3/Quality/log
```