#!/usr/bin/env python3
import os
import json
import argparse
from datetime import datetime
import importlib.util

def parse_file(filepath, num_lines):
    try:
        with open(filepath, 'r', encoding='utf-8') as file:
            return [file.readline().strip() for _ in range(num_lines)]
    except FileNotFoundError:
        print(f"Warning: File not found - {filepath}")
        return ["N/A"] * num_lines
    except Exception as e:
        print(f"Error reading file {filepath}: {e}")
        return ["ERROR"] * num_lines

def create_json_output(json_output, component):
    os.makedirs(json_output, exist_ok=True)
    output_file = os.path.join(json_output, f"{component}_results_{datetime.now().strftime('%Y-%m-%d')}.json")
    
    if not os.path.exists(output_file):
        json_data = {component: {}}
        with open(output_file, 'w', encoding='utf-8') as json_file:
            json.dump(json_data, json_file, indent=4)
    
    return output_file

def update_json_output(output_file, component, parent_dirs, file_name, metrics_data):
    try:
        with open(output_file, 'r', encoding='utf-8') as json_file:
            json_output = json.load(json_file)
    except (FileNotFoundError, json.JSONDecodeError):
        json_output = {component: {}}
    
    if component not in json_output:
        json_output[component] = {}
    
    top_level_dir = parent_dirs[0] if parent_dirs else ""
    relative_path = os.path.join(*parent_dirs[1:]) if len(parent_dirs) > 1 else ""
    if relative_path:
        relative_path += "/"
    
    if top_level_dir not in json_output[component]:
        json_output[component][top_level_dir] = {}

    json_output[component][top_level_dir][file_name] = {
        "path": relative_path,
        **metrics_data
    }

    with open(output_file, 'w', encoding='utf-8') as json_file:
        json.dump(json_output, json_file, indent=4)

def get_component_metrics(component, file_name, output_dir, commit_hash):
    metrics = {}
    
    metric_types = ["Performance", "Quality", "Robustness"]
    
    for metric_type in metric_types:
        metric_path = os.path.join(output_dir, metric_type, "results", commit_hash, f"{file_name}.log")
        
        if os.path.exists(metric_path):
            processor_name = f"{component.lower()}_processor"
            processor_path = os.path.join(os.path.dirname(__file__), f"{processor_name}.py")
            
            if os.path.exists(processor_path):
                spec = importlib.util.spec_from_file_location(processor_name, processor_path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                
                if hasattr(module, f"get_{metric_type.lower()}"):
                    processor_func = getattr(module, f"get_{metric_type.lower()}")
                    metrics[metric_type] = processor_func(file_name, output_dir, commit_hash)
            else:
                if metric_type == "Performance":
                    metrics[metric_type] = process_performance(metric_path)
                elif metric_type == "Quality":
                    metrics[metric_type] = process_quality(metric_path)
                elif metric_type == "Robustness":
                    metrics[metric_type] = process_robustness(metric_path)
    
    return metrics

def process_performance(filepath):
    try:
        lines = parse_file(filepath, 2)
        return {
            "seconds": lines[0],
            "memory_peaks": lines[1]
        }
    except Exception as e:
        print(f"Error processing performance data: {e}")
        return {"error": str(e)}

def process_quality(filepath):
    try:
        lines = parse_file(filepath, 10)
        
        quality_data = {}
        for i, line in enumerate(lines):
            if line and line != "N/A" and line != "ERROR":
                quality_data[f"metric_{i+1}"] = line
        
        return quality_data
    except Exception as e:
        print(f"Error processing quality data: {e}")
        return {"error": str(e)}

def process_robustness(filepath):
    try:
        lines = parse_file(filepath, 1)
        robustness_flag = lines[0]

        robustness_flags = {
            "VALID_SOLID_OUTPUT": 0,
            "INPUT_IS_INVALID": 0,
            "OUTPUT_IS_NOT_TRIANGLE_MESH": 0,
            "OUTPUT_IS_COMBINATORIAL_NON_MANIFOLD": 0,
            "OUTPUT_HAS_BORDERS": 0,
            "OUTPUT_HAS_DEGENERATED_FACES": 0,
            "OUTPUT_HAS_GEOMETRIC_SELF_INTERSECTIONS": 0,
            "OUTPUT_DOES_NOT_BOUND_VOLUME": 0,
            "OUTPUT_DOES_NOT_CONTAIN_INPUT": 0,
            "OUTPUT_DISTANCE_IS_TOO_LARGE": 0,
            "SIGSEGV": 0,
            "SIGABRT": 0,
            "SIGFPE": 0,
            "TIMEOUT": 0
        }

        if robustness_flag in robustness_flags:
            robustness_flags[robustness_flag] = 1

        result = {key: value for key, value in robustness_flags.items() if value == 1}

        return result
    except Exception as e:
        print(f"Error processing robustness data: {e}")
        return {"error": str(e)}

def process_single_file(file_path, input_folder, output_dir, json_output, commit_hash, component):
    relative_path = os.path.relpath(file_path, input_folder)
    parent_dir, file_name = os.path.split(relative_path)
    file_name = os.path.splitext(file_name)[0]
    parent_dirs = parent_dir.split(os.sep)
    parent_dirs = [d for d in parent_dirs if d]
    
    metrics_data = get_component_metrics(component, file_name, output_dir, commit_hash)
    
    output_file = os.path.join(json_output, f"{component}_results_{datetime.now().strftime('%Y-%m-%d')}.json")
    update_json_output(output_file, component, parent_dirs, file_name, metrics_data)

def process_all_files(input_folder, output_dir, json_output, commit_hash, component):
    valid_extensions = {
        '.off', '.obj', '.ply', '.stl', '.STL', '.ts', '.vtp'
    }

    all_files = []
    for root, _, files in os.walk(input_folder):
        for file in files:
            _, ext = os.path.splitext(file)
            if ext.lower() in [ext.lower() for ext in valid_extensions]:
                file_path = os.path.join(root, file)
                process_single_file(file_path, input_folder, output_dir, json_output, commit_hash, component)

def main():
    parser = argparse.ArgumentParser(description='Process benchmark data for CGAL components')
    parser.add_argument('--json-output', required=True, help='Directory for JSON output')
    parser.add_argument('--output-dir', required=True, help='Directory with benchmark results')
    parser.add_argument('--input-folder', help='Input data folder')
    parser.add_argument('--input-file', help='Single input file to process')
    parser.add_argument('--commit', required=True, help='Hash of the latest commit')
    parser.add_argument('--component', required=True, help='Component name')
    parser.add_argument('--init-only', action='store_true', help='Only initialize JSON file')
    parser.add_argument('--single-file', action='store_true', help='Process a single file')
    
    args = parser.parse_args()
    
    output_file = create_json_output(args.json_output, args.component)
    
    if args.init_only:
        print(f"JSON file initialized for {args.component}: {output_file}")
        return
    
    if args.single_file and args.input_file:
        print(f"Processing single file for {args.component}: {args.input_file}")
        process_single_file(args.input_file, args.input_folder, args.output_dir, 
                           args.json_output, args.commit, args.component)
    elif args.input_folder:
        print(f"Processing all files for {args.component} in: {args.input_folder}")
        process_all_files(args.input_folder, args.output_dir, args.json_output, 
                         args.commit, args.component)
    else:
        print("Error: Either --input-folder or (--single-file and --input-file) must be provided")
        return 1
    
    print(f"Processing complete for {args.component}")
    return 0

if __name__ == "__main__":
    main()