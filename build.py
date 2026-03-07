#!/usr/bin/env python3
"""
Workout Program Builder
Converts a CSV training program into a JSON file for the PWA.
Also manages user assignments (program + start date).

Usage:
    python build.py program.csv
    python build.py program.csv --assign "Juan:Hypertrophy A:2026-03-02"
    python build.py program.csv --assign "Juan:Hypertrophy A:2026-03-02" --assign "Sarah:Hypertrophy A:2026-03-09"
"""

import csv
import json
import sys
import argparse
from pathlib import Path
from collections import OrderedDict


def parse_csv(csv_path):
    """Parse the workout CSV into a structured dict."""
    programs = {}

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            program = row["Program"].strip()
            week = int(float(row["Week"].strip()))
            day = int(float(row["Day"].strip()))
            order = row["Order"].strip()

            if program not in programs:
                programs[program] = {}
            if week not in programs[program]:
                programs[program][week] = {}
            if day not in programs[program][week]:
                programs[program][week][day] = {
                    "day": day,
                    "isRest": False,
                    "exercises": [],
                }

            # Check for rest day
            if order.upper() == "REST":
                programs[program][week][day]["isRest"] = True
                programs[program][week][day]["restNote"] = row["Instruction"].strip()
                continue

            exercise = {
                "order": order,
                "name": row["Exercise"].strip(),
                "sets": int(float(row["Sets"].strip())) if row["Sets"].strip() else 0,
                "reps": row["Reps"].strip(),
                "tempo": row["Tempo"].strip(),
                "rest": row["Rest"].strip(),
                "rpe": row["RPE"].strip(),
                "instruction": row["Instruction"].strip(),
            }
            programs[program][week][day]["exercises"].append(exercise)

    # Convert to sorted lists for JSON
    output = {}
    for prog_name, weeks in programs.items():
        output[prog_name] = {
            "name": prog_name,
            "weeks": [],
        }
        for week_num in sorted(weeks.keys()):
            week_data = {"week": week_num, "days": []}
            for day_num in sorted(weeks[week_num].keys()):
                day_data = weeks[week_num][day_num]
                # Group exercises by their base order (for supersets)
                if not day_data["isRest"]:
                    groups = OrderedDict()
                    for ex in day_data["exercises"]:
                        # Extract base number: "2a" -> "2", "3" -> "3"
                        base = ""
                        for ch in ex["order"]:
                            if ch.isdigit():
                                base += ch
                            else:
                                break
                        if not base:
                            base = ex["order"]
                        if base not in groups:
                            groups[base] = []
                        groups[base].append(ex)

                    day_data["exerciseGroups"] = []
                    for base, exercises in groups.items():
                        group_type = "single"
                        if len(exercises) == 2:
                            group_type = "superset"
                        elif len(exercises) >= 3:
                            group_type = "circuit"
                        day_data["exerciseGroups"].append(
                            {"type": group_type, "exercises": exercises}
                        )
                    del day_data["exercises"]

                week_data["days"].append(day_data)
            output[prog_name]["weeks"].append(week_data)

    return output


def load_users(users_path):
    """Load existing user assignments."""
    if users_path.exists():
        with open(users_path, "r") as f:
            return json.load(f)
    return {}


def save_users(users, users_path):
    """Save user assignments."""
    with open(users_path, "w") as f:
        json.dump(users, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Build workout program JSON from CSV")
    parser.add_argument("csv_file", help="Path to the workout CSV file")
    parser.add_argument(
        "--assign",
        action="append",
        help='Assign user: "Name:Program:YYYY-MM-DD"',
    )
    parser.add_argument(
        "--output",
        default="program.json",
        help="Output JSON file (default: program.json)",
    )

    args = parser.parse_args()

    # Parse CSV
    programs = parse_csv(args.csv_file)

    # Handle user assignments
    users_path = Path("users.json")
    users = load_users(users_path)

    if args.assign:
        for assignment in args.assign:
            parts = assignment.split(":")
            if len(parts) != 3:
                print(f"Error: Invalid assignment format: {assignment}")
                print('Expected: "Name:Program:YYYY-MM-DD"')
                sys.exit(1)
            name, program, start_date = parts
            if program not in programs:
                print(f"Error: Program '{program}' not found. Available: {list(programs.keys())}")
                sys.exit(1)
            users[name] = {"program": program, "startDate": start_date}
            print(f"Assigned {name} -> {program} starting {start_date}")

        save_users(users, users_path)

    # Build final output
    output = {"programs": programs, "users": users}

    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nBuilt {args.output}")
    print(f"  Programs: {list(programs.keys())}")
    print(f"  Users: {list(users.keys()) if users else 'None assigned yet'}")
    print(f"\nTo assign users:")
    print(f'  python build.py {args.csv_file} --assign "Name:Program:YYYY-MM-DD"')


if __name__ == "__main__":
    main()
