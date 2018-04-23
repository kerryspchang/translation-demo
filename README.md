# Composition Project 

This is a temporary place to record some ideas and discussions on designing a "composition project". 

## Goals
* To make reusing a cloud composition easy and intuitive
* To make building a reusable cloud composition easy and intuitive 

## Motivations
* To provide a good getting started experience and let customers quickly try out some interesting composition examples 
* To create an ecosystem where developers could easily share their own compositions and also benefit from other people's work 

## Who are the users of a "composition project"? 
* Developer: A person who develops a cloud composition that uses multiple cloud functions and services. "Project" is the concept to bundle all the pieces together, and turns a composition into _a reusable code module_. 
* Consumer: A person who uses composition projects built by others to create their own project. 

A person can be both a project developer and consumer. This is similar to how people build a Node module using other existing modules. 

## What are some characteristics of a "composition project"? 
* A project includes not only the code for functions but also the configuration data of the resources used. For example, an IBM Cloud Service (like Watson Translation) that needs to be created, or an API key of a third-party service. 
    - Some of the configuration data might be blank (such as an API key) when a consumer first acquires a project. Those blanks need to be filled out before deploying and running the project.  

* A project will include explanations provided by the developer on 
    - What it does 
    - How to use it (its API)
    - Any resources it uses, including the billing info 

## Current design 
We use the Node module format as the base format for a composition project. A composition project is a Node module that returns one or more compositions. 
The structure of the project module is described here: 
* A `composition.js` that is the entry point of the module. It exports a composition or an object that contains multiple compositions, each composition can be referenced by its key name
    - In the examples below, the deployment of cloud functions is described in `composition.js` using `composer.action` instead of in `seed.yaml`. IMO it makes the module code easier to understand to Node developers. `composer.action` could generate a seed yaml file that actually does the deployment. 
* A `seed.yaml` file that describes the resources used and parameters to inject to cloud functions and packages, in Kubernetes YAML format
* A `package.json` that has the standard Node module data plus an `api` field that describes the usage of the module (using OpenAPI format), and a `choice` field that has instructions for credentials/parameters that the consumer needs to fill out. Data in `api` and `choice` are used in Shell to help consumers understand and configure a project module. 
* A `lib` folder that has the function code. Each file in `lib` is a OpenWhisk function to be deployed

## Examples 
Here we describe some examples of reusing composition modules. The examples use the latest composer v4 that enables the `composer.action` combinator to directly deploy an action given a local file. Seed is used to create cloud services other than functions, and _inject parameters from Kubernetes secret store to existing cloud functions (to be implemented)_. 

### Watson Translation as a Node Module
A simple Watson Translation Node module. It returns a JSON object that has two compositions: `translator` and `languageId`.  

`composition.js`: 
```javascript
const composer = require('@ibm-functions/composer')
module.exports = {
    translator: composer.action(`watson-translation/translator`, {filename: './lib/translator.js'}),
    languageId: composer.action(`watson-translation/languageId`, {filename: './lib/languageId.js'})
}
```
 
`seed.yaml`: Seed binds the service credentials to the `watson-translation` package created by `composer` in `composition.js`. 
```yaml
apiVersion: seed.ibm.com/v1
kind: CloudService
metadata:
  name: mytranslator
spec:
  service: language_translator
  plan: lite
---
apiVersion: seed.ibm.com/v1
kind: Function
metadata:
  name: watson-translation
spec:
  packages:
  - service: mytranslator
```


### Reusing the Watson Translation module in another composition module

Here, we create a new module called `translation-demo` that uses the Watson Translation module to build a composition flow for doing translation tasks. This module directly returns a composition. 

`composition.js`: 
```javascript
const watson = require('watson-translation'),
    composer = require('@ibm-functions/composer'),
    pkgName = require('./package.json').name // pkgName is the module name

module.exports = composer.try(
            composer.sequence(
                watson.languageId,
                composer.if(
                    p => p.language !== 'en',
                    composer.sequence(
                        p => ({translateFrom: p.language, translateTo: 'en', payload: p.payload}),
                        watson.translator
                    ),
                    composer.sequence(
                        p => ({text: p.payload}),
                        composer.action(`${pkgName}/en2shakespeare`, {fileName:'./lib/en2shakespeare.js'})
                    )           
                )
            ),
            err => ({payload:'Sorry we cannot translate your text'})
        )
```
  

`seed.yaml`: Here we use seed to inject parameters to the `en2shakespeare` function deployed by `composer`. 

```yaml
apiVersion: seed.ibm.com/v1
kind: Function
metadata:
  name: en2shakespeare
spec:
  packages:
  - name: ${projectName}
    actions:
    - runtime: nodejs:6
      parameters:
      - name: apiKey
        valueFrom:
          secretKeyRef:
            name: ${projectName}-secret
            key: ftApiKey  
```

### Recreating the Translation SMS bot using modules 

```javascript
const composer = require('@ibm-functions/composer'),    
    translation = require('translation-demo'),
    sendSms = require('ow-sendsms') // another project that expose a composition for sending SMS via Twilio 

composer.sequence(
    p => ({payload: p.Body, number: p.From}),
    composer.retain(translation), 
    p => ({body: p.result.payload, number: p.params.number}),
    sendSms
)
```

