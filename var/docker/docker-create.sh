#!/usr/bin/env bash

docker kill postqueen || true 
docker rm postqueen || true 
docker create --name postqueen -p 3000:3000 -p 4200:4200 localhost/postqueen
