# Changelog

## [2.0.0](https://github.com/adsabs/scix-mcp/compare/v1.3.1...v2.0.0) (2026-11-05)


### ⚠ BREAKING CHANGES

* update_permissions drops `owner` and adds `none`. Ownership moves via transfer_library; `none` revokes access.

### Bug Fixes

* **library:** accept partial edit_library responses ([c79ee0d](https://github.com/adsabs/scix-mcp/commit/c79ee0db6c000d5e4e7dd04d0a38b9316df0a69d))
* **library:** remove dead query endpoint, fix operation fields ([1298faa](https://github.com/adsabs/scix-mcp/commit/1298faa6efad93c1ed8620dc02a92eadc73bda3a))


### Miscellaneous Chores

* force a 2.0.0 release for the permission enum change ([9d76def](https://github.com/adsabs/scix-mcp/commit/9d76def4f6ecffdb8940c29d83754511783a40da))

## [1.3.1](https://github.com/adsabs/scix-mcp/compare/v1.3.0...v1.3.1) (2026-11-05)


### Bug Fixes

* **client:** report accurate errors for 403, 429, network, and 5xx ([63fcca7](https://github.com/adsabs/scix-mcp/commit/63fcca725f7ed19b891b20ff7eaec3e660ff5dba))
* **client:** report accurate errors for 403, 429, network, and 5xx ([c581946](https://github.com/adsabs/scix-mcp/commit/c581946b95984cecb8bbf576c94b8ee9f9fb6bf1))
* **library:** point annotation tools at biblib's real notes route ([6e91636](https://github.com/adsabs/scix-mcp/commit/6e916360543b34d6463f9fc6133007b542cf7c44))
* **library:** point annotation tools at biblib's real notes route ([1b392d6](https://github.com/adsabs/scix-mcp/commit/1b392d6a2589d2596f2834f83bdb9784479ac956))
* **library:** post bibcode, not bibcodes, to biblib create ([65d62bc](https://github.com/adsabs/scix-mcp/commit/65d62bca467ee7e0738f1e379e96e5afb5918f54))
* **library:** post bibcode, not bibcodes, to biblib create ([50c0722](https://github.com/adsabs/scix-mcp/commit/50c07229c7fc0311bfd0e34b5a90e294c1791517))
