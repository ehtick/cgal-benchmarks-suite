import os
import json
import sys
from datetime import datetime

def parse_file(filepath, num_lines):
    """Reads specific number of lines from a file and returns them as a list."""
    with open(filepath, 'r', encoding='utf-8') as file:
        return [file.readline().strip() for _ in range(num_lines)]

def create_json_output(json_output):
    os.makedirs(json_output, exist_ok=True)
    output_file = os.path.join(json_output, f"results_{datetime.now().strftime('%Y-%m-%d')}.json")
    json_output = {"Alpha_wrap_3": {}}
    with open(output_file, 'w', encoding='utf-8') as json_file:
        json.dump(json_output, json_file, indent=4)
    return output_file

def update_json_output(output_file,
                       parent_dirs,
                       file_name,
                       performance_data,
                       quality_data,
                       robustness_data):
    if os.path.exists(output_file):
        with open(output_file, 'r', encoding='utf-8') as json_file:
            json_output = json.load(json_file)
    else:
        json_output = {"Alpha_wrap_3": {}}
    top_level_dir = parent_dirs[0] if parent_dirs else ""
    relative_path = os.path.join(*parent_dirs[1:]) if len(parent_dirs) > 1 else ""
    if relative_path:
        relative_path += "/"
    if top_level_dir not in json_output["Alpha_wrap_3"]:
        json_output["Alpha_wrap_3"][top_level_dir] = {}

    json_output["Alpha_wrap_3"][top_level_dir][file_name] = {
        "path": relative_path,
        "Performance": performance_data,
        "Quality": quality_data,
        "Robustness": robustness_data
    }

    with open(output_file, 'w', encoding='utf-8') as json_file:
        json.dump(json_output, json_file, indent=4)

def get_performance(file, output_dir, latest_commit):
    filepath = os.path.join(output_dir, "Performance", "results", latest_commit, f"{file}.log")
    seconds, memory_peaks = parse_file(filepath, 2)
    performance_data = {
        "seconds": seconds,
        "memory_peaks": memory_peaks
    }
    return performance_data

def get_quality(file, output_dir, latest_commit):
    filepath = os.path.join(output_dir, "Quality", "results", latest_commit, f"{file}.log")
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
    quality_data = {
        "Mean_Min_Angle_(degree)": mean_min_angle,
        "Mean_Max_Angle_(degree)": mean_max_angle,
        "Mean_Radius_Ratio": mean_radius_ratio,
        "Mean_Edge_Ratio": mean_edge_ratio,
        "Mean_Aspect_Ratio": mean_aspect_ratio,
        "Complexity_(#_of_triangle)": complexity,
        "#_of_almost_degenerate_triangle": almost_degenerate_triangles,
        "Hausdorff_distance_output_to_input_(%_of_bbox_diag)": hausdorff_distance
    }
    return quality_data

def get_robustness(file, output_dir, latest_commit):
    filepath = os.path.join(output_dir, "Robustness", "results", latest_commit, f"{file}.log")
    robustness_flag = parse_file(filepath, 1)[0]
    robustness_flags_template = {
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
        "TIMEOUT": 0,
    }
    if robustness_flag in robustness_flags_template:
        robustness_flags_template[robustness_flag] = 1
    robustness_data = {key: value for key, value in robustness_flags_template.items() if value == 1}
    return robustness_data

def process_benchmark_files(off_files, output_dir, latest_commit, output_file):
    for off_file in off_files:
        parent_dir, file_name = os.path.split(off_file)
        file_name = os.path.splitext(file_name)[0]
        parent_dirs = parent_dir.split(os.sep)
        parent_dirs = [d for d in parent_dirs if d]
        performance_data = get_performance(file_name, output_dir, latest_commit)
        quality_data = get_quality(file_name, output_dir, latest_commit)
        robustness_data = get_robustness(file_name, output_dir, latest_commit)
        update_json_output(output_file,
                           parent_dirs,
                           file_name,
                           performance_data,
                           quality_data,
                           robustness_data)

def main(json_output, output_dir, data_folder, latest_commit):
    valid_extensions = {
        '.off', '.obj', '.ply', '.stl', '.STL', '.ts', '.vtp'
    }

    all_files = []
    for root, _, files in os.walk(data_folder):
        for file in files:
            _, ext = os.path.splitext(file)
            if ext.lower() in [ext.lower() for ext in valid_extensions]:
                relative_path = os.path.relpath(os.path.join(root, file), data_folder)
                all_files.append(relative_path)

    output_file = create_json_output(json_output)
    process_benchmark_files(all_files, output_dir, latest_commit, output_file)

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: process_benchmark_data.py \
<Json_Output> <Output_results> <Input_data_folder> <Hash_latest_commit>")
        sys.exit(1)
    Json_output = sys.argv[1]
    Output_results = sys.argv[2]
    Input_data_folder = sys.argv[3]
    Hash_latest_commit = sys.argv[4]
    main(Json_output, Output_results, Input_data_folder, Hash_latest_commit)
