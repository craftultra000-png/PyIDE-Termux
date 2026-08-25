# Security Policy

## Scope

PyIDE Termux Pro is intended for local use on the device running Termux. Do not expose its local server to an untrusted network or reverse proxy it publicly without adding authentication and a careful threat model.

## Current safeguards

The file API canonicalizes paths before each filesystem operation and permits only configured roots. Sensitive operating-system prefixes are blocked. The standard explorer omits dot-prefixed entries, and filename validation rejects raw path separators.

## Reporting a vulnerability

Please do not open a public issue for a potential security vulnerability. Instead, contact the repository owner privately through their GitHub profile with a concise reproduction, affected route or file, impact, and any suggested mitigation. Avoid publishing proof-of-concept payloads until a fix has been discussed.

## Supported versions

Security fixes are applied to the `main` branch.
