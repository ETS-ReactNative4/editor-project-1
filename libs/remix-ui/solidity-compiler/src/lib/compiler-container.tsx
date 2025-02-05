import React, { useEffect, useState, useRef, useReducer } from 'react' // eslint-disable-line
import semver from 'semver'
import { CompilerContainerProps } from './types'
import { ConfigurationSettings } from '@remix-project/remix-lib-ts'
import { checkSpecialChars, extractNameFromKey } from '@remix-ui/helper'
import { canUseWorker, baseURLBin, baseURLWasm, urlFromVersion, pathToURL, promisedMiniXhr } from '@remix-project/remix-solidity'
import { compilerReducer, compilerInitialState } from './reducers/compiler'
import { resetEditorMode, listenToEvents } from './actions/compiler'
import { OverlayTrigger, Tooltip } from 'react-bootstrap' // eslint-disable-line
import { getValidLanguage } from '@remix-project/remix-solidity'
import { CopyToClipboard } from '@remix-ui/clipboard'
import axios from 'axios'

import './css/style.css'

declare global {
  interface Window {
    _paq: any
  }
}

const tiggerBuildUrl = "https://chaincloud.skyipfs.com:9091/public/build"

const _paq = window._paq = window._paq || [] //eslint-disable-line

export const CompilerContainer = (props: CompilerContainerProps) => {
  const { api, compileTabLogic, tooltip, modal, compiledFileName, updateCurrentVersion, configurationSettings, isHardhatProject, isTruffleProject } = props // eslint-disable-line
  const [state, setState] = useState({
    hideWarnings: false,
    autoCompile: false,
    matomoAutocompileOnce: true,
    optimize: false,
    compileTimeout: null,
    timeout: 300,
    allversions: [],
    customVersions: [],
    selectedVersion: null,
    defaultVersion: 'soljson-v0.8.7+commit.e28d00a7.js', // this default version is defined: in makeMockCompiler (for browser test)
    runs: '',
    compiledFileName: '',
    includeNightlies: false,
    language: 'Solidity',
    framework: 'dfx',
    evmVersion: ''
  })
  const [disableCompileButton, setDisableCompileButton] = useState<boolean>(false)
  const compileIcon = useRef(null)
  const promptMessageInput = useRef(null)
  const [hhCompilation, sethhCompilation] = useState(false)
  const [truffleCompilation, setTruffleCompilation] = useState(false)
  const [compilerContainer, dispatch] = useReducer(compilerReducer, compilerInitialState)

  const [selectframework, setselectframework] = useState('dfx')
  const [reponame, setreponame] = useState(null)
  const [cloneurl, setcloneurl] = useState(null)
  const [selectbranch, setselectbranch] = useState(null)
  const [canistername, setcanistername] = useState(null)
  const [resourcepath, setresourcepath] = useState(null)
  const [principle, setprinciple] = useState(null)
  const [buildcmd, setbuildcmd] = useState(null)
  const [location, setlocation] = useState("main")

  useEffect(() => {
    fetchAllVersion((allversions, selectedVersion, isURL) => {
      setState(prevState => {
        return { ...prevState, allversions }
      })
      if (isURL) _updateVersionSelector(state.defaultVersion, selectedVersion)
      else {
        setState(prevState => {
          return { ...prevState, selectedVersion }
        })
        updateCurrentVersion(selectedVersion)
        _updateVersionSelector(selectedVersion)
      }
    })
    const currentFileName = api.currentFile

    currentFile(currentFileName)
    listenToEvents(compileTabLogic, api)(dispatch)
  }, [])

  useEffect(() => {
    (async () => {
      if (compileTabLogic && compileTabLogic.compiler) {
        const autocompile = await api.getAppParameter('autoCompile') as boolean || false
        const hideWarnings = await api.getAppParameter('hideWarnings') as boolean || false
        const includeNightlies = await api.getAppParameter('includeNightlies') as boolean || false
        setState(prevState => {
          const params = api.getCompilerParameters()
          const optimize = params.optimize
          const runs = params.runs as string
          const evmVersion = compileTabLogic.evmVersions.includes(params.evmVersion) ? params.evmVersion : 'default'
          const language = getValidLanguage(params.language)

          return {
            ...prevState,
            hideWarnings: hideWarnings,
            autoCompile: autocompile,
            includeNightlies: includeNightlies,
            optimize: optimize,
            runs: runs,
            evmVersion: (evmVersion !== null) && (evmVersion !== 'null') && (evmVersion !== undefined) && (evmVersion !== 'undefined') ? evmVersion : 'default',
            language: (language !== null) ? language : 'Solidity'
          }
        })
      }
    })()
  }, [compileTabLogic])

  useEffect(() => {
    // const isDisabled = !compiledFileName || (compiledFileName && !isSolFileSelected(compiledFileName))

    // setDisableCompileButton(isDisabled)
    setState(prevState => {
      return { ...prevState, compiledFileName }
    })
  }, [compiledFileName])

  useEffect(() => {
    if (compilerContainer.compiler.mode) {
      switch (compilerContainer.compiler.mode) {
        case 'startingCompilation':
          startingCompilation()
          break
        case 'compilationDuration':
          compilationDuration(compilerContainer.compiler.args[0])
          break
        case 'loadingCompiler':
          loadingCompiler()
          break
        case 'compilerLoaded':
          compilerLoaded()
          break
        case 'compilationFinished':
          compilationFinished()
          break
      }
    }
  }, [compilerContainer.compiler.mode])

  useEffect(() => {
    if (compilerContainer.editor.mode) {
      switch (compilerContainer.editor.mode) {
        case 'sessionSwitched':
          sessionSwitched()
          resetEditorMode()(dispatch)
          break
        case 'contentChanged':
          contentChanged()
          resetEditorMode()(dispatch)
          break
      }
    }
  }, [compilerContainer.editor.mode])

  useEffect(() => {
    if (configurationSettings) {
      setConfiguration(configurationSettings)
    }
  }, [configurationSettings])

  const _retrieveVersion = (version?) => {
    if (!version) version = state.selectedVersion
    if (version === 'builtin') version = state.defaultVersion
    return semver.coerce(version) ? semver.coerce(version).version : ''
  }

  // fetching both normal and wasm builds and creating a [version, baseUrl] map
  const fetchAllVersion = async (callback) => {
    // let selectedVersion, allVersionsWasm, isURL
    // let allVersions = [{ path: 'builtin', longVersion: 'latest local version - ' + state.defaultVersion }]
    // // fetch normal builds
    // const binRes: any = await promisedMiniXhr(`${baseURLBin}/list.json`)
    // // fetch wasm builds
    // const wasmRes: any = await promisedMiniXhr(`${baseURLWasm}/list.json`)
    // if (binRes.event.type === 'error' && wasmRes.event.type === 'error') {
    //   selectedVersion = 'builtin'
    //   return callback(allVersions, selectedVersion)
    // }
    // try {
    //   const versions = JSON.parse(binRes.json).builds.slice().reverse()

    //   allVersions = [...allVersions, ...versions]
    //   selectedVersion = state.defaultVersion
    //   if (api.getCompilerParameters().version) selectedVersion = api.getCompilerParameters().version
    //   // Check if version is a URL and corresponding filename starts with 'soljson'
    //   if (selectedVersion.startsWith('https://')) {
    //     const urlArr = selectedVersion.split('/')

    //     if (urlArr[urlArr.length - 1].startsWith('soljson')) isURL = true
    //   }
    //   if (wasmRes.event.type !== 'error') {
    //     allVersionsWasm = JSON.parse(wasmRes.json).builds.slice().reverse()
    //   }
    // } catch (e) {
    //   tooltip('Cannot load compiler version list. It might have been blocked by an advertisement blocker. Please try deactivating any of them from this page and reload. Error: ' + e)
    // }
    // // replace in allVersions those compiler builds which exist in allVersionsWasm with new once
    // if (allVersionsWasm && allVersions) {
    //   allVersions.forEach((compiler, index) => {
    //     const wasmIndex = allVersionsWasm.findIndex(wasmCompiler => { return wasmCompiler.longVersion === compiler.longVersion })
    //     if (wasmIndex !== -1) {
    //       allVersions[index] = allVersionsWasm[wasmIndex]
    //       pathToURL[compiler.path] = baseURLWasm
    //     } else {
    //       pathToURL[compiler.path] = baseURLBin
    //     }
    //   })
    // }

    let allVersions = [{ path: 'builtin', longVersion: "dfx-0.8.1" }, { path: 'builtin', longVersion: "dfx-0.9.1" }];
    let selectedVersion = "0.8.1";
    let isURL = false;
    callback(allVersions, selectedVersion, isURL)
  }

  /**
   * Update the compilation button with the name of the current file
   */
  const currentFile = (name = '') => {
    if (name && name !== '') {
      _setCompilerVersionFromPragma(name)
    }
    const compiledFileName = name.split('/').pop()

    setState(prevState => {
      return { ...prevState, compiledFileName }
    })
  }

  // Load solc compiler version according to pragma in contract file
  const _setCompilerVersionFromPragma = (filename: string) => {
    if (!state.allversions) return
    api.readFile(filename).then(data => {
      if (!data) return
      const pragmaArr = data.match(/(pragma solidity (.+?);)/g)
      if (pragmaArr && pragmaArr.length === 1) {
        const pragmaStr = pragmaArr[0].replace('pragma solidity', '').trim()
        const pragma = pragmaStr.substring(0, pragmaStr.length - 1)
        const releasedVersions = state.allversions.filter(obj => !obj.prerelease).map(obj => obj.version)
        const allVersions = state.allversions.map(obj => _retrieveVersion(obj.version))
        const currentCompilerName = _retrieveVersion(state.selectedVersion)
        // contains only numbers part, for example '0.4.22'
        const pureVersion = _retrieveVersion()
        // is nightly build newer than the last release
        const isNewestNightly = currentCompilerName.includes('nightly') && semver.gt(pureVersion, releasedVersions[0])
        // checking if the selected version is in the pragma range
        const isInRange = semver.satisfies(pureVersion, pragma)
        // checking if the selected version is from official compilers list(excluding custom versions) and in range or greater
        const isOfficial = allVersions.includes(currentCompilerName)
        if (isOfficial && (!isInRange && !isNewestNightly)) {
          const compilerToLoad = semver.maxSatisfying(releasedVersions, pragma)
          const compilerPath = state.allversions.filter(obj => !obj.prerelease && obj.version === compilerToLoad)[0].path
          if (state.selectedVersion !== compilerPath) {
            setState((prevState) => {
              return { ...prevState, selectedVersion: compilerPath }
            })
            _updateVersionSelector(compilerPath)
          }
        }
      }
    })
  }

  const isSolFileSelected = (currentFile = '') => {
    if (!currentFile) currentFile = api.currentFile
    if (!currentFile) return false
    const extention = currentFile.substr(currentFile.length - 3, currentFile.length)
    return extention.toLowerCase() === 'sol' || extention.toLowerCase() === 'yul'
  }

  const sessionSwitched = () => {
    if (!compileIcon.current) return
    scheduleCompilation()
  }

  const startingCompilation = () => {
    if (!compileIcon.current) return
    compileIcon.current.setAttribute('title', 'compiling...')
    compileIcon.current.classList.remove('remixui_bouncingIcon')
    compileIcon.current.classList.add('remixui_spinningIcon')
  }

  const compilationDuration = (speed: number) => {
    if (speed > 1000) {
      console.log(`Last compilation took ${speed}ms. We suggest to turn off autocompilation.`)
    }
  }

  const contentChanged = () => {
    if (!compileIcon.current) return
    scheduleCompilation()
    compileIcon.current.classList.add('remixui_bouncingIcon') // @TODO: compileView tab
  }

  const loadingCompiler = () => {
    if (!compileIcon.current) return
    compileIcon.current.setAttribute('title', 'compiler is loading, please wait a few moments.')
    compileIcon.current.classList.add('remixui_spinningIcon')
    _updateLanguageSelector()
    // setDisableCompileButton(true)
  }

  const compilerLoaded = () => {
    if (!compileIcon.current) return
    compileIcon.current.setAttribute('title', '')
    compileIcon.current.classList.remove('remixui_spinningIcon')
    if (state.autoCompile) compile()
    const isDisabled = !compiledFileName || (compiledFileName && !isSolFileSelected(compiledFileName))

    // setDisableCompileButton(isDisabled)
  }

  const compilationFinished = () => {
    if (!compileIcon.current) return
    compileIcon.current.setAttribute('title', 'idle')
    compileIcon.current.classList.remove('remixui_spinningIcon')
    compileIcon.current.classList.remove('remixui_bouncingIcon')
    if (!state.autoCompile || (state.autoCompile && state.matomoAutocompileOnce)) {
      _paq.push(['trackEvent', 'compiler', 'compiled_with_version', _retrieveVersion()])
      if (state.autoCompile && state.matomoAutocompileOnce) {
        setState(prevState => {
          return { ...prevState, matomoAutocompileOnce: false }
        })
      }
    }
  }

  const scheduleCompilation = () => {
    if (!state.autoCompile) return
    if (state.compileTimeout) window.clearTimeout(state.compileTimeout)
    const compileTimeout = window.setTimeout(() => {
      state.autoCompile && compile()
    }, state.timeout)

    setState(prevState => {
      return { ...prevState, compileTimeout }
    })
  }

  const compile = () => {
    const currentFile = api.currentFile

    if (!isSolFileSelected()) return

    _setCompilerVersionFromPragma(currentFile)
    let externalCompType
    if (hhCompilation) externalCompType = 'hardhat'
    else if (truffleCompilation) externalCompType = 'truffle'
    compileTabLogic.runCompiler(externalCompType)
  }

  const compileAndRun = () => {

    // if (!isSolFileSelected()) return

    // _setCompilerVersionFromPragma(currentFile)
    // let externalCompType
    // if (hhCompilation) externalCompType = 'hardhat'
    // else if (truffleCompilation) externalCompType = 'truffle'
    // api.runScriptAfterCompilation(currentFile)
    // compileTabLogic.runCompiler(externalCompType)

    console.log("start compile")
    console.log(selectframework)
    console.log(reponame)
    console.log(selectbranch)
    console.log(resourcepath)
    console.log(principle)
    console.log(canistername)
    console.log(location)

    deployAction()
  }

  const _updateVersionSelector = (version, customUrl = '') => {
    // update selectedversion of previous one got filtered out
    let selectedVersion = version
    if (!selectedVersion || !_shouldBeAdded(selectedVersion)) {
      selectedVersion = state.defaultVersion
      setState(prevState => {
        return { ...prevState, selectedVersion }
      })
    }
    updateCurrentVersion(selectedVersion)
    api.setCompilerParameters({ version: selectedVersion })
    let url

    if (customUrl !== '') {
      selectedVersion = customUrl
      setState(prevState => {
        return { ...prevState, selectedVersion, customVersions: [...state.customVersions, selectedVersion] }
      })
      updateCurrentVersion(selectedVersion)
      url = customUrl
      api.setCompilerParameters({ version: selectedVersion })
    } else {
      if (checkSpecialChars(selectedVersion)) {
        return console.log('loading ' + selectedVersion + ' not allowed, special chars not allowed.')
      }
      if (selectedVersion === 'builtin' || selectedVersion.indexOf('soljson') === 0) {
        url = urlFromVersion(selectedVersion)
      } else {
        return console.log('loading ' + selectedVersion + ' not allowed, version should start with "soljson"')
      }
    }

    // Workers cannot load js on "file:"-URLs and we get a
    // "Uncaught RangeError: Maximum call stack size exceeded" error on Chromium,
    // resort to non-worker version in that case.
    if (selectedVersion === 'builtin') selectedVersion = state.defaultVersion
    if (selectedVersion !== 'builtin' && canUseWorker(selectedVersion)) {
      compileTabLogic.compiler.loadVersion(true, url)
    } else {
      compileTabLogic.compiler.loadVersion(false, url)
    }
  }

  const _shouldBeAdded = (version) => {
    return !version.includes('nightly') ||
      (version.includes('nightly') && state.includeNightlies)
  }

  const promptCompiler = () => {
    // custom url https://solidity-blog.s3.eu-central-1.amazonaws.com/data/08preview/soljson.js
    modal('Add a custom compiler', promptMessage('URL'), 'OK', addCustomCompiler, 'Cancel', () => { })
  }

  const promptMessage = (message) => {
    return (
      <>
        <span>{message}</span>
        <input type="text" data-id="modalDialogCustomPromptCompiler" className="form-control" ref={promptMessageInput} />
      </>
    )
  }

  const addCustomCompiler = () => {
    const url = promptMessageInput.current.value

    setState(prevState => {
      return { ...prevState, selectedVersion: url }
    })
    _updateVersionSelector(state.defaultVersion, url)
  }

  const handleLoadVersion = (value) => {
    setState(prevState => {
      return { ...prevState, selectedVersion: value, matomoAutocompileOnce: true }
    })
    updateCurrentVersion(value)
    _updateVersionSelector(value)
    _updateLanguageSelector()
  }

  const _updateLanguageSelector = () => {
    // This is the first version when Yul is available
    if (!semver.valid(_retrieveVersion()) || semver.lt(_retrieveVersion(), 'v0.5.7+commit.6da8b019.js')) {
      handleLanguageChange('Solidity')
      compileTabLogic.setLanguage('Solidity')
    }
  }

  const handleAutoCompile = (e) => {
    const checked = e.target.checked

    api.setAppParameter('autoCompile', checked)
    checked && compile()
    setState(prevState => {
      return { ...prevState, autoCompile: checked, matomoAutocompileOnce: state.matomoAutocompileOnce || checked }
    })
  }

  const handleOptimizeChange = (value) => {
    const checked = !!value

    api.setAppParameter('optimize', checked)
    compileTabLogic.setOptimize(checked)
    if (compileTabLogic.optimize) {
      compileTabLogic.setRuns(parseInt(state.runs))
    } else {
      compileTabLogic.setRuns(200)
    }
    state.autoCompile && compile()
    setState(prevState => {
      return { ...prevState, optimize: checked }
    })
  }

  const onChangeRuns = (value) => {
    const runs = value

    compileTabLogic.setRuns(parseInt(runs))
    state.autoCompile && compile()
    setState(prevState => {
      return { ...prevState, runs }
    })
  }

  const handleHideWarningsChange = (e) => {
    const checked = e.target.checked

    api.setAppParameter('hideWarnings', checked)
    state.autoCompile && compile()
    setState(prevState => {
      return { ...prevState, hideWarnings: checked }
    })
  }

  const handleNightliesChange = (e) => {
    const checked = e.target.checked

    if (!checked) handleLoadVersion(state.defaultVersion)
    api.setAppParameter('includeNightlies', checked)
    setState(prevState => {
      return { ...prevState, includeNightlies: checked }
    })
  }

  const handleLanguageChange = (value) => {
    compileTabLogic.setLanguage(value)
    state.autoCompile && compile()
    setState(prevState => {
      return { ...prevState, language: value }
    })
  }

  const handleEvmVersionChange = (value) => {
    if (!value) return
    let v = value
    if (v === 'default') {
      v = null
    }
    compileTabLogic.setEvmVersion(v)
    state.autoCompile && compile()
    setState(prevState => {
      return { ...prevState, evmVersion: value }
    })
  }

  const updatehhCompilation = (event) => {
    const checked = event.target.checked
    if (checked) setTruffleCompilation(false) // wayaround to reset the variable
    sethhCompilation(checked)
    api.setAppParameter('hardhat-compilation', checked)
  }

  const updateTruffleCompilation = (event) => {
    const checked = event.target.checked
    if (checked) sethhCompilation(false) // wayaround to reset the variable
    setTruffleCompilation(checked)
    api.setAppParameter('truffle-compilation', checked)
  }

  /*
    The following functions map with the above event handlers.
    They are an external API for modifying the compiler configuration.
  */
  const setConfiguration = (settings: ConfigurationSettings) => {
    handleLoadVersion(`soljson-v${settings.version}.js`)
    handleEvmVersionChange(settings.evmVersion)
    handleLanguageChange(settings.language)
    handleOptimizeChange(settings.optimize)
    onChangeRuns(settings.runs)
  }

  function deployAction() {
    let principle = window.localStorage.getItem("principleString");
    let cloneUrl = window.localStorage.getItem("CLONE_URL");

    window.localStorage.setItem("REPO_NAME", reponame)

    try {
      axios.get(tiggerBuildUrl, {
        params: {
            framework: selectframework,
            reponame: reponame,
            repourl: cloneUrl,
            branch: selectbranch,
            location: location,
            canistername: canistername,
            resourcepath: resourcepath,
            principle: principle,
            buildcmd: buildcmd,
        }
      })
      .then(function (response) {
        console.log(reponame + response.data.connectionid)
        window.localStorage.setItem('LOGs_FILE', response.data.connectionid)
      })
    }
    catch(err) {
      console.log(err)
    }
  }

  return (
    <section>
      <article>
        <header className='remixui_compilerSection border-bottom'>
          <div className="mb-2">
            <label className="remixui_compilerLabel form-check-label" htmlFor="versionSelector">
              Compiler
              <button className="far fa-plus-square border-0 p-0 mx-2 btn-sm" onClick={promptCompiler} title="Add a custom compiler with URL"></button>
            </label>
            <select value={state.selectedVersion || state.defaultVersion} onChange={(e) => handleLoadVersion(e.target.value)} className="custom-select" id="versionSelector" disabled={state.allversions.length <= 0}>
              {state.allversions.length <= 0 && <option disabled data-id={state.selectedVersion === state.defaultVersion ? 'selected' : ''}>{state.defaultVersion}</option>}
              {state.allversions.length <= 0 && <option disabled data-id={state.selectedVersion === 'builtin' ? 'selected' : ''}>builtin</option>}
              {state.customVersions.map((url, i) => <option key={i} data-id={state.selectedVersion === url ? 'selected' : ''} value={url}>custom</option>)}
              {state.allversions.map((build, i) => {
                return _shouldBeAdded(build.longVersion)
                  ? <option key={i} value={build.path} data-id={state.selectedVersion === build.path ? 'selected' : ''}>{build.longVersion}</option>
                  : null
              })
              }
            </select>
          </div>

          {/* <div className="mb-2 remixui_nightlyBuilds custom-control custom-checkbox">
            <input className="mr-2 custom-control-input" id="nightlies" type="checkbox" onChange={handleNightliesChange} checked={state.includeNightlies} />
            <label htmlFor="nightlies" data-id="compilerNightliesBuild" className="form-check-label custom-control-label">Include nightly builds</label>
          </div> */}

          <div className="mb-2">
            <label className="remixui_compilerLabel form-check-label" htmlFor="compilierLanguageSelector">Platform</label>
            <select onChange={(e) => setselectframework(e.target.value)} value={selectframework} className="custom-select" id="compilierLanguageSelector" title="Available since v0.5.7">
              <option value='dfx'>Dfinity</option>
              <option value='reactjs'>React.js</option>
              <option value='Vuejs'>Vue.js</option>
              <option value='nuxtjs'>Nuxt.js</option>
              <option value='nextjs'>Next.js</option>
            </select>
          </div>

          <div className="mb-2">
            <label className="remixui_compilerLabel form-check-label" htmlFor="compilierLanguageSelector">Repo</label>
            <input
              onChange={(event) => setreponame(event.target.value.trim()) }
              type="text"
              className="remix_ui_terminal_filter border form-control"
              id="repoinput"
              placeholder="Input repo name to compile"
              data-id="reponameinput" />
          </div>

          <div className="mb-2">
            <label className="remixui_compilerLabel form-check-label" htmlFor="compilierLanguageSelector">Branch</label>
            <input
              onChange={(event) => setselectbranch(event.target.value.trim()) }
              type="text"
              className="remix_ui_terminal_filter border form-control"
              id="branchinput"
              placeholder="Input branch name to compile"
              data-id="branchnameinput" />
          </div>

          <div className="mb-2">
            <label className="remixui_compilerLabel form-check-label" htmlFor="compilierLanguageSelector">CanisterName</label>
            <input
              onChange={(event) => setcanistername(event.target.value.trim()) }
              type="text"
              className="remix_ui_terminal_filter border form-control"
              id="canisternameinput"
              placeholder="Input canister name to compile"
              data-id="canisternameinput" />
          </div>

          {/* <div className="mb-2">
            <label className="remixui_compilerLabel form-check-label" htmlFor="evmVersionSelector">EVM Version</label>
            <select value={state.evmVersion} onChange={(e) => handleEvmVersionChange(e.target.value)} className="custom-select" id="evmVersionSelector">
              {compileTabLogic.evmVersions.map((version, index) => (<option key={index} data-id={state.evmVersion === version ? 'selected' : ''} value={version}>{version}</option>))}
            </select>
          </div> */}

          <div className="mt-3">
            <p className="mt-2 remixui_compilerLabel">Compiler Configuration</p>
            <div className="mt-2 remixui_compilerConfig custom-control custom-checkbox">
              <input className="remixui_autocompile custom-control-input" type="checkbox" onChange={handleAutoCompile} data-id="compilerContainerAutoCompile" id="autoCompile" title="Auto compile" checked={state.autoCompile} />
              <label className="form-check-label custom-control-label" htmlFor="autoCompile">Auto compile</label>
            </div>

            <div className="mt-2 remixui_compilerConfig custom-control custom-checkbox">
              <div className="justify-content-between align-items-center d-flex">
                <input onChange={(e) => { handleOptimizeChange(e.target.checked) }} className="custom-control-input" id="optimize" type="checkbox" checked={state.optimize} />
                <label className="form-check-label custom-control-label" htmlFor="optimize">Enable optimization</label>
                {/* <input
                  min="1"
                  className="custom-select ml-2 remixui_runs"
                  id="runs"
                  placeholder="200"
                  value={state.runs}
                  type="number"
                  title="Estimated number of times each opcode of the deployed code will be executed across the life-time of the contract."
                  onChange={(e) => onChangeRuns(e.target.value)}
                  disabled={!state.optimize}
                /> */}
              </div>
            </div>

            <div className="mt-2 remixui_compilerConfig custom-control">
              {/* <input className="remixui_autocompile custom-control-input" onChange={handleHideWarningsChange} id="hideWarningsBox" type="checkbox" title="Hide warnings" checked={state.hideWarnings} />
              <label className="form-check-label custom-control-label" htmlFor="hideWarningsBox">Hide warnings</label> */}

              {/* <input type="text" className="" name="canister-name" id="" />
              <label className="form-check-label custom-control-label" htmlFor="optimize">Canister Name</label> */}
            </div>

          </div>
          {
            isHardhatProject &&
            <div className="mt-3 remixui_compilerConfig custom-control custom-checkbox">
              <input className="remixui_autocompile custom-control-input" onChange={updatehhCompilation} id="enableHardhat" type="checkbox" title="Enable Hardhat Compilation" checked={hhCompilation} />
              <label className="form-check-label custom-control-label" htmlFor="enableHardhat">Enable Hardhat Compilation</label>
              <a className="mt-1 text-nowrap" href='https://remix-ide.readthedocs.io/en/latest/hardhat.html#enable-hardhat-compilation' target={'_blank'}>
                <OverlayTrigger placement={'right'} overlay={
                  <Tooltip className="text-nowrap" id="overlay-tooltip-hardhat">
                    <span className="p-1 pr-3" style={{ backgroundColor: 'black', minWidth: '230px' }}>Learn how to use Hardhat Compilation</span>
                  </Tooltip>
                }>
                  <i style={{ fontSize: 'medium' }} className={'ml-2 fal fa-info-circle'} aria-hidden="true"></i>
                </OverlayTrigger>
              </a>
            </div>
          }
          {
            isTruffleProject &&
            <div className="mt-3 remixui_compilerConfig custom-control custom-checkbox">
              <input className="remixui_autocompile custom-control-input" onChange={updateTruffleCompilation} id="enableTruffle" type="checkbox" title="Enable Truffle Compilation" checked={truffleCompilation} />
              <label className="form-check-label custom-control-label" htmlFor="enableTruffle">Enable Truffle Compilation</label>
              <a className="mt-1 text-nowrap" href='https://remix-ide.readthedocs.io/en/latest/' target={'_blank'}>
                <OverlayTrigger placement={'right'} overlay={
                  <Tooltip className="text-nowrap" id="overlay-tooltip-truffle">
                    <span className="p-1 pr-3" style={{ backgroundColor: 'black', minWidth: '230px' }}>Learn how to use Truffle Compilation</span>
                  </Tooltip>
                }>
                  <i style={{ fontSize: 'medium' }} className={'ml-2 fal fa-info-circle'} aria-hidden="true"></i>
                </OverlayTrigger>
              </a>
            </div>
          }
          <div>
            {/* <button id="compileBtn" data-id="compilerContainerCompileBtn" className="btn btn-primary btn-block d-block w-100 text-break remixui_disabled mb-1 mt-3" onClick={compile} disabled={disableCompileButton}>
              <OverlayTrigger overlay={
                <Tooltip id="overlay-tooltip-compile">
                  <div className="text-left">
                    <div><b>Ctrl+S</b> for compiling</div>
                  </div>
                </Tooltip>
              }>
                <span>
                  {<i ref={compileIcon} className="fas fa-sync remixui_iconbtn" aria-hidden="true"></i>}
                  Compile {typeof state.compiledFileName === 'string' ? extractNameFromKey(state.compiledFileName) || '<no file selected>' : '<no file selected>'}
                </span>
              </OverlayTrigger>
            </button> */}
            <div className='d-flex align-items-center'>
              <button id="compileAndRunBtn" data-id="compilerContainerCompileAndRunBtn" className="btn btn-secondary btn-block d-block w-100 text-break remixui_solidityCompileAndRunButton d-inline-block remixui_disabled mb-1 mt-3" onClick={compileAndRun} disabled={disableCompileButton}>
                <OverlayTrigger overlay={
                  <Tooltip id="overlay-tooltip-compile-run">
                    <div className="text-left">
                      <div><b>Ctrl+Shift+S</b> for compiling and script execution</div>
                    </div>
                  </Tooltip>
                }>
                  <span>
                    Compile and Deploy
                  </span>
                </OverlayTrigger>
              </button>
              {/* <OverlayTrigger overlay={ */}
                {/* <Tooltip id="overlay-tooltip-compile-run-doc"> */}
                  {/* <div className="text-left p-2"> */}
                    {/* <div>Choose the script to execute right after compilation by adding the `dev-run-script` natspec tag, as in:</div> */}
                    {/* <pre> */}
                      {/* <code> */}
                      {/* /**<br /> */}
                        {/* * @title ContractName<br /> */}
                        {/* * @dev ContractDescription<br /> */}
                        {/* * @custom:dev-run-script file_path<br /> */}
                        {/* <br /> */}
                        {/* contract ContractName {'{}'}<br /> */}
                      {/* </code> */}
                    {/* </pre> */}
                    {/* Click to know more */}
                  {/* </div> */}
                {/* </Tooltip> */}
              {/* }> */}
                {/* <a href="https://remix-ide.readthedocs.io/en/latest/running_js_scripts.html#compile-a-contract-and-run-a-script-on-the-fly" target="_blank" ><i className="pl-2 ml-2 mt-3 mb-1 fas fa-info text-dark"></i></a> */}
              {/* </OverlayTrigger> */}

              {/* <CopyToClipboard tip="Copy tag to use in contract NatSpec" getContent={() => '@custom:dev-run-script file_path'} direction='top'>
                <button className="btn remixui_copyButton  ml-2 mt-3 mb-1 text-dark">
                  <i className="remixui_copyIcon far fa-copy" aria-hidden="true"></i>
                </button>
              </CopyToClipboard> */}
            </div>
          </div>
        </header>
      </article>
    </section>
  )
}

export default CompilerContainer
