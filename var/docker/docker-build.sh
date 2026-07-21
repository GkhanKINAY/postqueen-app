#!/bin/bash

set -o xtrace

docker rmi localhost/postqueen || true
docker build -t localhost/postqueen -f Dockerfile.dev .
