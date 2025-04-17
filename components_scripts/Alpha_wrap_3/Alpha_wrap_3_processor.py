import os
import json
import argparse
from datetime import datetime

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

def get_performance(file_name, output_dir):
    filepath = os.path.join(output_dir, "Performance", "results", "a", f"{file_name}.log")
    seconds, memory_peaks = parse_file(filepath, 2)
    return {
        "seconds": seconds,
        "memory_peaks": memory_peaks
    }

def get_quality(file_name, output_dir):
    filepath = os.path.join(output_dir, "Quality", "results", "a", f"{file_name}.log")
    (
        mean_min_angle,
        mean_max_angle,
        mean_radius_ratio,
        mean_edge_ratio,
        mean_aspect_ratio,
        complexity,
        almost_degenerate_triangles,
        hausdorff_distance
    ) = parse_file(filepath, 8)
    return {
        "Mean_Min_Angle_(degree)": mean_min_angle,
        "Mean_Max_Angle_(degree)": mean_max_angle,
        "Mean_Radius_Ratio": mean_radius_ratio,
        "Mean_Edge_Ratio": mean_edge_ratio,
        "Mean_Aspect_Ratio": mean_aspect_ratio,
        "Complexity_(#_of_triangle)": complexity,
        "#_of_almost_degenerate_triangle": almost_degenerate_triangles,
        "Hausdorff_distance_output_to_input_(%_of_bbox_diag)": hausdorff_distance
    }

def get_robustness(file_name, output_dir):
    filepath = os.path.join(output_dir, "Robustness", "results", "a", f"{file_name}.log")
    robustness_flag = parse_file(filepath, 1)[0]
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
    return {k: v for k, v in robustness_flags.items() if v == 1}

def process_all_files(input_folder, output_dir, json_output_path):
    valid_extensions = {'.off', '.obj', '.ply', '.stl', '.STL', '.ts', '.vtp'}
    results = {}

    for root, _, files in os.walk(input_folder):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in valid_extensions:
                file_path = os.path.join(root, file)
                file_name = os.path.splitext(file)[0]

                rel_path = os.path.relpath(file_path, input_folder)
                sub_dirs = os.path.dirname(rel_path).split(os.sep)
                top_dir = sub_dirs[0] if sub_dirs else ""
                sub_path = os.path.join(*sub_dirs[1:]) if len(sub_dirs) > 1 else ""

                if top_dir not in results:
                    results[top_dir] = {}

                metrics = {
                    "path": sub_path + "/" if sub_path else "",
                    "Performance": get_performance(file_name, output_dir),
                    "Quality": get_quality(file_name, output_dir),
                    "Robustness": get_robustness(file_name, output_dir)
                }

                results[top_dir][file_name] = metrics

    with open(json_output_path, 'w', encoding='utf-8') as json_file:
        json.dump({"Alpha_wrap_3": results}, json_file, indent=4)

def main():
    parser = argparse.ArgumentParser(description="Alpha_wrap_3 benchmark metrics parser")
    parser.add_argument('--input-folder', required=True, help='Path to input mesh folder')
    parser.add_argument('--output-dir', required=True, help='Path to benchmark output folder')
    parser.add_argument('--json-output', required=True, help='Path to output JSON file')
    args = parser.parse_args()

    current_date = datetime.now().strftime("%Y-%m-%d")
    json_output_path = f"{args.json_output}_{current_date}.json"

    process_all_files(args.input_folder, args.output_dir, json_output_path)
    print(f"Results written to {args.json_output}")

if __name__ == "__main__":
    main()
