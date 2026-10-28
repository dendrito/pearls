#!/bin/sh
# Copy the web app from the main project into the Apple project.
set -e
cd "$(dirname "$0")"
rm -rf www
cp -R ../www www
rm -f www/icon-512.png
echo "www synced"
