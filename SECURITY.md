# Security Policy

## Supported use

This project is intended to run as a local service under your control.

Basic safety expectations:
- keep it bound to localhost unless you have a strong reason not to
- do not commit `config.json`
- do not commit credential files
- review logs and rewrite rules before publishing customizations
- rotate credentials immediately if you suspect exposure

## Reporting a vulnerability

If you find a security issue in the code or docs, please report it privately to the maintainer before posting full public details.

A good report includes:
- affected file or component
- impact
- reproduction steps
- suggested fix if you have one

## Sensitive files to keep local

Examples of files that should stay out of version control:
- `config.json`
- local smoke-test configs
- credential files under `~/.claude/`
- internal session notes or incident reports
