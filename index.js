'use strict';

const path = require('path')
    , fs = require('fs')
    , env = Object.assign({}, process.env)
    , cp = require('child_process')
    , Machine = require('docker-machine')
    , unixify = require('unixify')
    , series = require('run-series')
    , debug = require('debug')('docker-share')

if (env.VBOX_MSI_INSTALL_PATH) {
  const key = Object.keys(env).find(key => key.toUpperCase() === 'PATH')
  env[key] = env[key] + path.delimiter + env.VBOX_MSI_INSTALL_PATH
}

class VirtualBox {
  constructor(name) {
    this.name = name
  }

  command(args, done) {
    debug('vboxmanage', args)

    cp.execFile('vboxmanage', args, {
      env: env,
      encoding: 'utf8'
    }, done)
  }

  addShare(name, hostPath, opts, done) {
    if (typeof opts === 'function') done = opts, opts = {}
    else if (!opts) opts = {}

    const args = ['sharedfolder', 'add', this.name]

    args.push('--name', name)
    args.push('--hostpath', hostPath)

    if (opts.writable === false || opts.readonly) args.push('--readonly')
    if (opts.transient) args.push('--transient')

    this.command(args, done)
  }

  removeShare() {

  }

  info(done) {
    this.command(['showvminfo', this.name], done)
  }

  getShares(done) {
    this.info((err, info) => {
      if (err) return done(err)

      const re = /Name: '(.*)', Host path: '(.*)'(.*)/g
      const shares = {}

      let match;
      while(match = re.exec(info)) {
        const share = { name: match[1], hostPath: match[2] }

        ;(match[3] || '').split(',').forEach(prop => {
          // "(transient mapping)" => share.transient = true
          prop = prop.trim().replace(/^\(|\)$/g, '')

          if (prop === 'transient mapping') prop = 'transient'
          else if (prop === 'machine mapping') return

          share[prop] = true
        })

        shares[share.name] = share
      }

      debug(shares)
      done(null, shares)
    })
  }

  getShare(name, done) {
    this.getShares((err, shares) => {
      if (err) done(err)
      else done(null, shares[name] || null)
    })
  }

  hasShare(name, done) {
    this.getShare(name, (err, share) => {
      if (err) done(err)
      else done(null, !!share)
    })
  }

  getState(done) {
    this.info((err, info) => {
      if (err) return done(err)

      const m = /State:\s+(.+)/.exec(info)
      if (!m) return done(new Error('Could not find state'))

      done(null, m[1])
    })
  }
}

class Shares {
  constructor(opts) {
    this.machine = new Machine({ name: opts.machine })
    this.vm = new VirtualBox(this.machine.name)
  }

  static unixify(path) {
    const unix = unixify(path)
    const m = path.match(/^([A-Z]):/i)
    return m ? '/' + m[1].toLowerCase() + unix : unix
  }

  mount(opts, done) {
    if (typeof opts === 'function') done = opts, opts = {}
    else if (!opts) opts = {}

    const hostPath = path.resolve(opts.hostPath || '.')
    const name = opts.name || path.basename(hostPath)
    const guestPath = Shares.unixify(opts.guestPath || hostPath)
    const state = {}

    debug('Mounting %s..', name)

    series([
      (next) => {
        this.vm.getState((err, state) => {
          if (err) return next(err)

          if (opts.transient && !/^running/.test(state)) {
            return next(new Error(
              'VM must be running to create a transient shared folder'
            ))
          }

          // TODO: can't mount it
          if (!opts.transient && !/^powered off/.test(state)) {
            return next(new Error(
              'VM must be powered off to create a permanent shared folder'
            ))
          }

          next()
        })
      },

      (next) => {
        this.vm.getShare(name, (err, share) => {
          if (err) return next(err)
          state.share = share
          next()
        })
      },

      (next) => {
        // TODO: compare properties
        if (state.share) next()
        else this.vm.addShare(name, hostPath, opts, next)
      },

      (next) => {
        this.getFilesystem(name, (err, fs) => {
          if (err) return next(err)
          state.fs = fs
          next()
        })
      },

      (next) => {
        if (state.fs) {
          if (state.fs.type !== 'vboxsf') {
            return next(new Error(
              `Mount conflict: existing filesystem of type "${state.fs.type}"`
            ))
          }

          if (state.fs.path !== guestPath) {
            return next(new Error(
              `Mount conflict: existing filesystem at path "${state.fs.path}"`
            ))
          }

          return next()
        }

        this.mountFilesystem(name, guestPath, next)
      },

      (next) => {
        process.stdout.write('Testing ' + guestPath + '.. ')

        this.machine.ssh('ls ' + guestPath, (err) => {
          if (err) process.stdout.write('FAIL\n')
          else process.stdout.write('OK\n')
          next(err)
        })
      }
    ], done)
  }

  getFilesystems(done) {
    debug('mount')

    this.machine.ssh('mount', (err, result) => {
      if (err) return done(err)

      const re = /^([^ ]+) on ([^ ]+) type ([^ ]+)/igm
      const filesystems = {}

      let match;
      while(match = re.exec(result)) {
        const mp = { name: match[1], path: match[2], type: match[3] }
        filesystems[mp.name] = mp
      }

      debug(filesystems)
      done(null, filesystems)
    })
  }

  getFilesystem(name, done) {
    this.getFilesystems((err, filesystems) => {
      if (err) done(err)
      else done(null, filesystems[name] || null)
    })
  }

  mountFilesystem(name, guestPath, done) {
    const mkdir = `sudo mkdir -p "${guestPath}"`
    debug(mkdir)

    this.machine.ssh(mkdir, (err) => {
      if (err) return done(err)

      const opt = 'defaults,uid=`id -u docker`,gid=`id -g docker`'
      const mount = `sudo mount -t vboxsf -o ${opt} ${name} ${guestPath}`

      debug(mount)
      this.machine.ssh(mount, done)
    })
  }
}

module.exports = Shares
