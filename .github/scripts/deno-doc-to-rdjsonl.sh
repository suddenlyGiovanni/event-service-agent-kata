#!/bin/bash
# Convert deno doc --lint output to reviewdog rdjsonl format
# See: https://github.com/reviewdog/reviewdog/tree/master/proto/rdf

set -eo pipefail

current_file=""
current_line=""
current_col=""
error_type=""
message=""

while IFS= read -r line; do
  # Strip ANSI color codes
  line=$(echo "$line" | sed 's/\x1b\[[0-9;]*m//g')
  
  # Match error line: error[error-type]: message
  if [[ $line =~ ^error\[([^\]]+)\]:\ (.+)$ ]]; then
    error_type="${BASH_REMATCH[1]}"
    message="${BASH_REMATCH[2]}"
  fi
  
  # Match file location: --> file:line:col
  if [[ $line =~ --\>\ (.+):([0-9]+):([0-9]+)$ ]]; then
    current_file="${BASH_REMATCH[1]}"
    current_line="${BASH_REMATCH[2]}"
    current_col="${BASH_REMATCH[3]}"
    
    # Output in rdjsonl format
    # Use WARNING severity since these are doc issues, not critical errors
    cat <<RDJSON
{"message":"[$error_type] $message","location":{"path":"$current_file","range":{"start":{"line":$current_line,"column":$current_col}}},"severity":"WARNING"}
RDJSON
  fi
done
