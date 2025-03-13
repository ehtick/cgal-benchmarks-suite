#!/bin/bash
# $1: directory containing the CGAL project
# $2: directory containing the input data folder
# $3: directory containing the output results
# $4: number of virtual thread used
# $5: hash of the latest commit

CGAL_directory=$1
Input_data_folder=$2
Json_Output=$3
Benchmark_Output=$4
Virtual_thread=$5
Hash_latest_commit=$6
Alpha_wrap_3_alpha_value=30
Alpha_wrap_3_timeout_value=130

$CGAL_directory/Alpha_wrap_3/benchmark/Alpha_wrap_3/benchmarking.sh $CGAL_directory $Input_data_folder $Benchmark_Output $Alpha_wrap_3_alpha_value $Alpha_wrap_3_timeout_value $Virtual_thread $Hash_latest_commit

python3 $CGAL_directory/Maintenance/test_handling/testsuite_benchmarking/process_benchmark_data.py $Json_Output $Benchmark_Output $Input_data_folder $Hash_latest_commit

#rm -r $Benchmark_Output