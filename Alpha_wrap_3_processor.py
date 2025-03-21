#!/usr/bin/env python3
import os

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

def get_performance(file_name, output_dir, commit_hash):
    filepath = os.path.join(output_dir, "Performance", "results", commit_hash, f"{file_name}.log")
    seconds, memory_peaks = parse_file(filepath, 2)
    performance_data = {
        "seconds": seconds,
        "memory_peaks": memory_peaks
    }
    return performance_data

def get_quality(file_name, output_dir, commit_hash):
    filepath = os.path.join(output_dir, "Quality", "results", commit_hash, f"{file_name}.log")
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

def get_robustness(file_name, output_dir, commit_hash):
    filepath = os.path.join(output_dir, "Robustness", "results", commit_hash, f"{file_name}.log")
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