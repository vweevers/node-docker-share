# docker-share

**Share local folders with a Docker Machine VM. Currently only capable of adding and mounting transient shares on a running VM.**

[![node](https://img.shields.io/node/v/docker-share.svg?style=flat-square)](https://www.npmjs.org/package/docker-share) [![npm status](http://img.shields.io/npm/v/docker-share.svg?style=flat-square)](https://www.npmjs.org/package/docker-share)  [![Dependency status](https://img.shields.io/david/vweevers/node-docker-share.svg?style=flat-square)](https://david-dm.org/vweevers/node-docker-share)

## motivation

On Windows with Docker Toolbox, one [can't mount data volumes outside of `C:\Users`](https://github.com/docker/compose/issues/2548). This makes the use of Docker Compose and relative data volumes (`.:/code`) rather problematic. As a remedy (when migrating to [Windows 10 with Docker for Windows Beta](https://github.com/docker/compose/issues/2548#issuecomment-232415158) is not an option) we can add a project's directory as a VirtualBox shared folder. Then mount it inside the Docker Machine VM - at the exact same path as on the Windows box so that relative volumes resolve correctly. This tool does this for you (and more, like checking if the share already exists). Its main functionality is roughly equivalent to:

```batch
cd C:\projects\my-project

vboxmanage sharedfolder add default ^
  --name my-project --hostpath "%cd%" ^
  --transient

docker-machine ssh default sudo ^
  mkdir -p /c/projects/my-project

docker-machine ssh default sudo ^
  mount -t vboxsf -o ^
  defaults,uid=`id -u docker`,gid=`id -g docker` ^
  my-project /c/projects/my-project
```

This tool should work on other platforms too. If you've found a use for it, let me know! Or just do a little dance.

## example

These commands should be run after `docker-machine start`, but before `docker run` or `docker-compose up`. Mount the current working directory:

```
docker-share mount --transient
```

Mount the current working directory, transient and read-only, at `/home/docker/beep` on a non-default Docker Machine:

```   
docker-share mount -m my-machine -tr . /home/docker/beep
```

## roadmap

- [x] Mount transient share
- [ ] Mount permanent share (check state, stop VM if `--force`, edit boot script, restart)
- [ ] Unmount

## usage

### `docker-share <command> [options]`

```
Commands:
  mount    Create shared folder and mount it
  unmount  Unmount and remove shared folder if it exists

Global options:
  --machine, -m  Machine name (DOCKER_MACHINE_NAME or "default")  [string]
  --verbose      Verbose output                                  [boolean]

Run 'docker-share <command> --help' for more information on a command.
```

#### `mount [local path] [guest path]`

Creates a VirtualBox shared folder and mounts it inside the VM. Without arguments, the local and guest path default to the current working directory. A guest path like `C:\project` is converted to a cygwin-style `/c/project`.

```
Options:
  --name, -n       Shared folder name (basename of local path)  [string]
  --readonly, -r   Create read-only shared folder              [boolean]
  --transient, -t  Create temporary shared folder              [boolean]
  --help           Show help                                   [boolean]
```

## install

With [npm](https://npmjs.org) do:

```
npm install docker-share --global
```

## license

[MIT](http://opensource.org/licenses/MIT) © Vincent Weevers
