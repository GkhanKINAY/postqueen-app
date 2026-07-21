#!/usr/bin/env bash

docker kill postqueen || true 
docker rm postqueen || true 
docker create --name postqueen -p 4007:5000 localhost/postqueen
