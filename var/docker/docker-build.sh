#!/bin/bash

set -o xtrace

docker rmi localhost/postqueen || true
docker build --target dist -t localhost/postqueen -f Dockerfile.dev .
docker build --target devcontainer -t localhost/postqueen-devcontainer -f Dockerfile.dev .
