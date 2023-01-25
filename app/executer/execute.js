import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import {is, getBusinessObject} from 'bpmn-js/lib/util/ModelUtil';
const {EventEmitter} = require('events');
const {Engine} = require('bpmn-engine');
const axios = require('axios').default;
const workerpool = require('workerpool');

import {confirmIcon, errIcon} from "../svg/Icons";
import customModule from '../custom/executer';
import iotExtension from '../../resources/iot.json';
import camundaExtension from '../../resources/camunda.json';
import { isNil } from 'min-dash';

const processModel = sessionStorage.getItem('xml') ? sessionStorage.getItem('xml') : '';
const containerEl = document.getElementById('js-canvas');
const runBtn = document.getElementById('runBtn');
import {Timers} from "./Timer";
import {
  convertInputToBooleanOrKeepType,
  convertInputToFloatOrKeepType,
  getResponseByAttributeAccessor
} from "./ExecuteHelper";
import Color from "../custom/helper/Color";

let start_t;
let end_t;
let executedTasksArr = [];
const pool = workerpool.pool('/worker.js');
let timeout;

// create modeler
const bpmnViewer = new NavigatedViewer({
  container: containerEl,
  additionalModules: [
    customModule
  ],
  moddleExtensions: {
    iot: iotExtension,
    camunda: camundaExtension
  }
});

let overlays = bpmnViewer.get('overlays');

// import XML
bpmnViewer.importXML(processModel).then(() => {
  bpmnViewer.get("canvas").zoom("fit-viewport", "auto");
}).catch((err) => {
  console.error(err);
});


//Engine stuff
const listener = new EventEmitter();

const engine = Engine({
  name: 'process model execution',
  source: processModel,
  timers: Timers(),
  moddleOptions: {
    iot: iotExtension,
    camunda: camundaExtension
  }
});

listener.on('activity.timer', (api, execution) => {
  timeout = api.content.timeout;
  console.log(api.content.startedAt + api.content.timeout);
});

listener.on('activity.timeout', (api, execution) => {
  // Hier kommen wir rein, wenn die Boundary-Event-Zeit abläuft
  //pool.terminate({force:true});
});

listener.on('activity.start', (start) => {
  start_t = new Date().getTime();

  console.log("=-=-=-=-=-=-=-=");
  console.log(start.id);
  fillSidebarRightLog("=-=-=-=-=-=-=-=");
  fillSidebarRightLog(start.id);

  let startEventArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:StartEvent"));
  let endEventArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:EndEvent"));
  let catchEventArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:IntermediateCatchEvent"));



  let startEvent = startEventArr.find(startEvent => startEvent.id === start.id && startEvent?.businessObject.type === 'start');
  let endEvent = endEventArr.find(endEvent => endEvent.id === start.id && endEvent?.businessObject.type === 'end');
  let catchEvent = catchEventArr.find(catchEvent => catchEvent.id === start.id && catchEvent?.businessObject.type === 'catch');
  let throwEvent = catchEventArr.find(throwEvent => throwEvent.id === start.id && throwEvent?.businessObject.type === 'throw');

  if(!startEvent && !catchEvent && !endEvent && !throwEvent) {
    fillSidebar("1", start.name, start_t, "StartTime", start.id, start.type, "", "", "", "");
  }

  if(catchEvent) {
    fillSidebar("1", start.name, start_t, "StartTime", start.id, 'bpmn:IoTIntermediateCatchEvent', "", "", "", "");
  }

  if(endEvent) {
    fillSidebar("1", start.name, start_t, "StartTime", start.id, 'bpmn:IoTEndEvent', "", "", "", "");
  }

  if(throwEvent) {
    fillSidebar("1", start.name, start_t, "StartTime", start.id, 'bpmn:IoTIntermediateThrowEvent', "", "", "", "");
  }

});


listener.on('activity.wait', (waitObj) => {
  let sourceId = waitObj.content.inbound;

  let taskArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:Task"));
  let startEventArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:StartEvent"));
  let catchEventArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:IntermediateCatchEvent"));
  let boundaryEventArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:BoundaryEvent"));
  let boundaryEvent = boundaryEventArr.filter(boundaryEvent => boundaryEvent.businessObject.attachedToRef.id === waitObj.id);
  let boundaryEventType = boundaryEvent? boundaryEvent.map(event => event.businessObject.eventDefinitions[0]['$type']) : [];

  let startEvent = startEventArr.find(startEvent => startEvent.id === waitObj.id);
  let catchEvent = catchEventArr.find(catchEvent => catchEvent.id === waitObj.id && catchEvent?.businessObject.type === 'catch');
  let throwEvent = catchEventArr.find(throwEvent => throwEvent.id === waitObj.id && throwEvent?.businessObject.type === 'throw');
  let task = taskArr.find(task => task.id === waitObj.id);

  if(startEvent || catchEvent) {
    let event = startEvent ? startEvent : catchEvent;
    highlightElement(event, Color.orange);
    const mathLoopCall = (businessObj, eventValue) => {
      let extensionElements = businessObj.get("extensionElements")?.values;
      let iotProperties = extensionElements.filter(element => element['$type'] === 'iot:Properties')[0].values[0];

      let name = iotProperties.key;
      let mathOp = iotProperties.mathOP;
      let mathOpVal = iotProperties.value;
      let timeout = iotProperties.timeout;

      if (name && mathOp && mathOpVal && mathOpVal) {
        mathOpVal = convertInputToFloatOrKeepType(mathOpVal);
        fillSidebar("1", waitObj.name, new Date().getTime(), "StartTime", waitObj.id, 'sensor', "", "", "", name + " " + mathOp + " " + mathOpVal);
        const axiosGet = () => {
          let noTimeoutOccured =  new Date().getTime() - start_t <= timeout * 1000;
          if(!timeout || noTimeoutOccured) {
            axios.get(eventValue).then((resp) => {
              let resVal = getResponseByAttributeAccessor(resp.data, name);
              if (!isNil(resVal)) {
                fillSidebar("1", waitObj.name, new Date().getTime(), "EvalTime", waitObj.id, 'sensor', "", String(resVal), "", name + " " + mathOp + " " + mathOpVal);
                switch (mathOp) {
                  case '<' :
                    if (parseFloat(resVal) < mathOpVal) {
                      console.log(name + " reached state " + resVal);
                      fillSidebarRightLog(name + " reached state " + resVal);
                      fillSidebar("1", waitObj.name, new Date().getTime(), "EndTime", waitObj.id, 'sensor', "", String(resVal), "", name + " " + mathOp + " " + mathOpVal);
                      if(startEvent) {
                        fillSidebar("1", waitObj.name, new Date().getTime(), "StartTime", waitObj.id, 'bpmn:IoTStartEvent', "", String(resVal), "", name + " " + mathOp + " " + mathOpVal);
                      }
                      waitObj.signal();
                    } else {
                      console.log("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      fillSidebarRightLog("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      axiosGet();
                    }
                    break;
                  case '=' :
                    mathOpVal = convertInputToBooleanOrKeepType(mathOpVal)
                    if (resVal === mathOpVal) {
                      console.log(name + " reached state " + resVal);
                      fillSidebarRightLog(name + " reached state " + resVal);
                      fillSidebar("1", waitObj.name, new Date().getTime(), "EndTime", waitObj.id, 'sensor', "", String(resVal), "", name + " " + mathOp + " " + mathOpVal);
                      if(startEvent) {
                        fillSidebar("1", waitObj.name, new Date().getTime(), "StartTime", waitObj.id, 'bpmn:IoTStartEvent', "", String(resVal), "", name + " " + mathOp + " " + mathOpVal);
                      }
                      waitObj.signal();
                    } else {
                      console.log("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      fillSidebarRightLog("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      axiosGet();
                    }
                    break;
                  case '>' :
                    if (parseFloat(resVal) > mathOpVal) {
                      console.log(name + " reached state " + resVal);
                      fillSidebarRightLog(name + " reached state " + resVal);
                      fillSidebar("1", waitObj.name, new Date().getTime(), "EndTime", waitObj.id, 'sensor', "", String(resVal), "", name + " " + mathOp + " " + mathOpVal);
                      if(startEvent) {
                        fillSidebar("1", waitObj.name, new Date().getTime(), "StartTime", waitObj.id, 'bpmn:IoTStartEvent', "", String(resVal), "", name + " " + mathOp + " " + mathOpVal);
                      }
                      waitObj.signal();
                    } else {
                      console.log("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      fillSidebarRightLog("WAIT UNTIL " + name + " with state " + resVal + " reached");
                      axiosGet();
                    }
                    break;
                  default:
                    console.log("Default case stopped IoT start");
                    fillSidebarRightLog("Default case stopped IoT start");
                    engine.stop();
                }
              } else {
                console.log("Key not in response - IoT start");
                fillSidebarRightLog("Key not in response - IoT start");
              }
            }).catch((e) => {
              console.log(e);
              console.log("Recursion axios error in input");
              fillSidebarRightLog("Recursion axios error in input: " + e);
              highlightErrorElements(null, waitObj, "Not executed", e, "-", boundaryEventType);
            });
          } else {
            fillSidebarRightLog("Timeout occurred");
            highlightErrorElements(null, waitObj, "Not executed", "event/start timeout", "-", boundaryEventType);
          }
        }
        axiosGet();
      } else {
        console.log("Error in extensionsElement in IoT start");
        fillSidebarRightLog("Error in extensionsElement in IoT start");
        highlightErrorElements(null, waitObj, "Not executed", "start extensionElement", '-', boundaryEventType);
      }
    }

    let businessObj = getBusinessObject(event);
    let eventValUrl = businessObj.get("extensionElements")?.values.filter(element => element['$type'] === 'iot:Properties')[0].values[0].url;
    //let Link = businessObj.get("extensionElements")?.values.filter(element => element['$type'] === 'iot:Properties')[0].values[0].url;

    if(businessObj.type) {
      if(eventValUrl) {
        mathLoopCall(businessObj, eventValUrl);
      }
      else {
        console.log("No iot start URL value defined");
        fillSidebarRightLog("No iot start URL value defined");
        highlightErrorElements(null, waitObj, "Not executed", "No iot start URL value defined", '-', boundaryEventType);
        engine.stop();
      }
    } else {
      waitObj.signal();
    }
  }

  if(throwEvent) {
    highlightElement(throwEvent, Color.orange);
    let businessObj = getBusinessObject(throwEvent);
    let iotProperties = businessObj.get("extensionElements")?.values.filter(element => element['$type'] === 'iot:Properties')[0].values[0];
    let eventValUrl = iotProperties.url;
    let method = iotProperties.method;
    if(eventValUrl) {
      fillSidebar("1", waitObj.name, new Date().getTime(), "StartTime", waitObj.id, 'actuator', "", "", "", "");
      if(method === 'GET') {
        axios.get( eventValUrl).then((resp)=>{
          console.log("HTTP GET successfully completed");
          console.log('Executed call: ' + eventValUrl);
          fillSidebar("1", waitObj.name, new Date().getTime(), "EndTime", waitObj.id, 'actuator', "", resp.status, "Status Code", "");
          fillSidebarRightLog("HTTP GET successfully completed");
          fillSidebarRightLog('Executed GET: ' + eventValUrl);
          waitObj.signal();
        }).catch((e)=>{
          console.log(e);
          console.log("HTTP GET FAILED!! - DataOutputAssociation ACTOR");
          fillSidebarRightLog("HTTP GET FAILED!! - DataOutputAssociation ACTOR: "+e);
          highlightErrorElements(null, waitObj, "Not executed" , e, sourceId[0].sourceId,boundaryEventType);
        });
      } else {
        axios.post( eventValUrl, {}, { headers: {'Content-Type': 'application/json','Access-Control-Allow-Origin': '*'}}).then((resp)=>{
          console.log("HTTP POST successfully completed");
          console.log('Executed call: ' + eventValUrl);
          fillSidebar("1", waitObj.name, new Date().getTime(), "EndTime", waitObj.id, 'bpmn:IoTIntermediateThrowEvent', "", resp.status, "Status Code", "");
          fillSidebarRightLog("HTTP POST successfully completed");
          fillSidebarRightLog('Executed call: ' + eventValUrl);
          waitObj.signal();
        }).catch((e)=>{
          console.log(e);
          console.log("HTTP POST FAILED!! - DataOutputAssociation ACTOR");
          fillSidebarRightLog("HTTP POST FAILED!! - DataOutputAssociation ACTOR: "+e);
          highlightErrorElements(null, waitObj, "Not executed" , e, sourceId[0].sourceId,boundaryEventType);
        });
      }
    } else {
      console.log("Error in extensionsElement in IoT intermediate actor event");
      fillSidebarRightLog("No URL specified at IoT throw event");
      highlightErrorElements(null, waitObj, "Not executed" , "extensionElement", sourceId[0].sourceId, boundaryEventType);
    }
  }

  const extractedInputs = (iotInputs, workerArr) => {
    iotInputs.forEach(input => {
      highlightElement(input, Color.orange);
      let businessObj = getBusinessObject(input);

      if (businessObj.type === 'sensor') {
        workerArr.push(
            pool.exec('sensorCall', [businessObj], {
              on: payload => {
                if(payload.responseForLog) {
                  const res = payload.responseForLog;
                  fillSidebar(res.case, res.label, res.timestamp, res.timestampType, res.id, res.type ,waitObj.id, res.responseValue || "", res.responseType || "", "");
                } else {
                  fillSidebarRightLog(payload.status);
                }
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              if (result.value) {
                waitObj.environment.variables[input.id] = result.value;
              }
              highlightElement(input, Color.green_low_opacity);
              return result;
            }).catch(e => {
              console.log(e);
              highlightErrorElements(input, waitObj, "Not executed", e, "-", boundaryEventType);
              throw e;
            })
        )
      }
      if (businessObj.type === 'sensor-sub') {
        let execArray = [];
        waitObj.environment.variables[input.id] = {};
        let values = businessObj.extensionElements?.values.filter(element => element['$type'] === 'iot:Properties')[0].values;
        values.forEach(value => {
          if (value.url && value.key && value.name) {
            let execElement = pool.exec('sensorCallGroup', [value.url, value.key, businessObj], {
            }).then(result => {
              console.log("Result:");
              console.log(result);
              if (result.value) {
                waitObj.environment.variables[input.id] = {...waitObj.environment.variables[input.id], [value.name] : result.value };
              }
              highlightElement(input, Color.green_low_opacity);
              return result;
            }).catch(e => {
              console.log(e);
              highlightErrorElements(input, waitObj, "Not executed", e, "-", boundaryEventType);
              throw e;
            })
            execArray.push(execElement);
            workerArr.push(execElement)
          } else {
            console.log("SensorGroup: Key or URL incorrect / doesn't exist");
          }
        })
        Promise.allSettled(execArray).then((values) => {
          let rejected = values.filter(val => val.status === 'rejected');
          if (rejected.length === 0) {
            highlightElement(input, Color.green_low_opacity);
          } else {
            highlightErrorElements(input, waitObj, "Not executed", "ActorGroup error", "-", boundaryEventType);
          }
        });
      }
      if(businessObj.type === 'artefact-catch') {
        highlightElement(input, Color.orange)
        workerArr.push(
            pool.exec('sensorCatchArtefact', [businessObj, start_t, timeout], {
              on: payload => {
                if(payload.responseForLog) {
                  const res = payload.responseForLog;
                  fillSidebar(res.case, res.label, res.timestamp, res.timestampType, res.id, res.type ,waitObj.id, res.responseValue || "", res.responseType || "", res.condition || "");
                } else {
                  fillSidebarRightLog(payload.status);
                }
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              if (result.value) {
                waitObj.environment.variables[input.id] = result.value;
              }
              highlightElement(input, Color.green_low_opacity);
              return result;
            }).catch(e => {
              console.log(e);
              highlightErrorElements(input, waitObj, "Not executed", e, "-", boundaryEventType);
              throw e;
            })
        )

      }
      if(businessObj.type === 'artefact-catch-sub') {
        let execArray = [];
        let values = businessObj.extensionElements?.values.filter(element => element['$type'] === 'iot:Properties')[0].values;
        values.forEach(value => {
          if (value.url && value.key && value.name) {
            let execElement = pool.exec('sensorCatchArtefactGroup', [value, businessObj.id, start_t, timeout], {
              on: payload => {
                fillSidebarRightLog(payload.status);
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              if (result) {
                waitObj.environment.variables[input.id] = {...waitObj.environment.variables[input.id], [value.name] : result };
              }
              return result;
            }).catch(e => {
              console.log(e);
              throw e;
            })
            execArray.push(execElement);
            workerArr.push(execElement)
          } else {
            console.log("SensorGroup: Key or URL incorrect / doesn't exist");
          }
        })
        Promise.allSettled(execArray).then((values) => {
          let rejected = values.filter(val => val.status === 'rejected');
          if (rejected.length === 0) {
            highlightElement(input, Color.green_low_opacity);
          } else {
            highlightErrorElements(input, waitObj, "Not executed", "Sensor Catch Artefact Group error", "-", boundaryEventType);
          }
        });

      }
    })
  }

  const extractedOutputs = (iotOutputs, workerArr) => {
    iotOutputs.forEach(output => {
      highlightElement(output, Color.orange);
      let businessObj = getBusinessObject(output);

      if (businessObj.type === 'actor') {
        workerArr.push(
            pool.exec('actorCall', [businessObj], {
              on: payload => {
                if(payload.responseForLog) {
                  const res = payload.responseForLog;
                  fillSidebar(res.case, res.label, res.timestamp, res.timestampType, res.id, res.type ,waitObj.id, res.responseValue || "", res.responseType || "", "");
                } else {
                  fillSidebarRightLog(payload.status);
                }
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              highlightElement(output, Color.green_low_opacity);
              return result;
            }).catch(e => {
              highlightErrorElements(output, waitObj, "Not executed", e, "-", boundaryEventType);
              console.log(e);
              throw e;
            })
        )
      }
      if (businessObj.type === 'actor-sub') {
        let execArray = [];
        let values = businessObj.extensionElements?.values.filter(element => element['$type'] === 'iot:Properties')[0].values;
        values.forEach(value => {
          let execElement = pool.exec('actorCallGroup', [value.url, value.method, businessObj], {
            on: payload => {
              if(payload.responseForLog) {
                const res = payload.responseForLog;
                fillSidebar(res.case, res.label, res.timestamp, res.timestampType, res.id, res.type ,waitObj.id, res.responseValue || "", res.responseType || "", "");
              } else {
                fillSidebarRightLog(payload.status);
              }
            }
          }).then(result => {
            console.log("Result:");
            console.log(result);
            return result;
          }).catch(e => {
            console.log(e);
            throw e;
          })
          execArray.push(execElement);
          workerArr.push(execElement);
        })
        Promise.allSettled(execArray).then((values) => {
          let rejected = values.filter(val => val.status === 'rejected');
          if (rejected.length === 0) {
            highlightElement(output, Color.green_low_opacity);
          } else {
            highlightErrorElements(output, waitObj, "Not executed", "ActorGroup error", "-", boundaryEventType);
          }
        });
      }
      //TODO: handle obj the right way. Currently it acts as an actor
      if (businessObj.type === 'obj') {
        workerArr.push(
            pool.exec('actorCall', [businessObj], {
              on: payload => {
                if(payload.responseForLog) {
                  const res = payload.responseForLog;
                  fillSidebar(res.case, res.label, res.timestamp, res.timestampType, res.id, 'bpmn:ObjectArtifact' ,waitObj.id, res.responseValue || "", res.responseType || "", "");
                } else {
                  fillSidebarRightLog(payload.status);
                }
              }
            }).then(result => {
              console.log("Result:");
              console.log(result);
              highlightElement(output, Color.green_low_opacity);
              return result;
            }).catch(e => {
              highlightErrorElements(output, waitObj, "Not executed", e, "-", boundaryEventType);
              console.log(e);
              throw e;
            })
        )
      }
    })
  }


  const extractedPromise = (workerArr) => {
    Promise.allSettled(workerArr).then((values) => {
      console.log(values);
      let rejected = values.filter(val => val.status === 'rejected');
      if (rejected.length === 0) {
        waitObj.signal();
      }
    }).catch((e) => console.log(e));
  }

  if(task) {
    const workerArr = [];
    let businessObj = getBusinessObject(task);

    let iotDecisionGroup = businessObj.get("dataInputAssociations")?.map(input => {
      if (input.sourceRef[0].type && input.sourceRef[0].type === 'decision-group') {
        return bpmnViewer.get('elementRegistry').find(element => element.id === input.sourceRef[0].id);
      }
    }).filter(e => e !== undefined);
    let iotInputs = businessObj.get("dataInputAssociations")?.map(input => {
      if (input.sourceRef[0].type && input.sourceRef[0].type !== 'decision-group') {
        return bpmnViewer.get('elementRegistry').find(element => element.id === input.sourceRef[0].id);
      }
    }).filter(e => e !== undefined);
    let iotOutputs = businessObj.get("dataOutputAssociations")?.map(input => {
      if(input.targetRef.type) {
        return bpmnViewer.get('elementRegistry').find(element => element.id === input.targetRef.id);
      }
    }).filter(e => e !== undefined);

    if(iotInputs.length === 0 && iotOutputs.length === 0 && iotDecisionGroup.length === 0){
      waitObj.signal();
    } else {
      highlightElement(task, Color.orange);
    }
    if(iotInputs.length > 0 && iotOutputs.length === 0) {
      // run registered functions on the worker via exec
      extractedInputs(iotInputs, workerArr);
      extractedPromise(workerArr);
    }

    if(iotOutputs.length > 0 && iotInputs.length === 0) {
      extractedOutputs(iotOutputs, workerArr);
      extractedPromise(workerArr);
    }

    if (iotOutputs.length > 0 && iotInputs.length > 0) {
      extractedInputs(iotInputs, workerArr);
      extractedOutputs(iotOutputs, workerArr);
      extractedPromise(workerArr);
    }
  }
})

listener.on('activity.end', (element)=>{
  end_t = new Date().getTime();
  let time = end_t - start_t;

  console.log("EXECUTION TIME: "+ time);
  fillSidebarRightLog("EXECUTION TIME: " + time + " ms");


  let currentElement = bpmnViewer.get('elementRegistry').find((elem)=>elem.id === element.id);
  let businessObj = getBusinessObject(currentElement) ? getBusinessObject(currentElement) : null;
  let timeStamp = timestampToDate(element.messageProperties.timestamp);
  let obj = element.content.inbound;

  if(businessObj?.type === 'end') {
    highlightElement(currentElement, Color.orange);
    const workerArr = [];
    workerArr.push(
      pool.exec('actorCall', [businessObj], {
        on: payload => {
          if(payload.responseForLog) {
            const res = payload.responseForLog;
            fillSidebar(res.case, res.label, res.timestamp, res.timestampType, res.id, 'actuator' ,element.id, res.responseValue || "", res.responseType || "", "");
          } else {
            fillSidebarRightLog(payload.status);
          }
        }
      }).then(result => {
        let end_t_1 = new Date().getTime();
        let _time = end_t_1 - start_t;
        console.log("Result:");
        console.log(result);
        highlightElement(currentElement, Color.green_low_opacity);
        addOverlays(currentElement, _time);
        fillSidebar("1", element.label, new Date().getTime(), 'EndTime', element.id, 'bpmn:IoTEndEvent' ,"", "", "", "");
        return result;
      }).catch(e => {
        let end_t_1 = new Date().getTime();
        let _time = end_t_1 - start_t;
        highlightErrorElements(null, element, "Not executed", e, "-", []);
        console.log(e);
        throw e;
      })
    )
  } else {
    if(businessObj?.type !== 'decision-group') {
      highlightElement(currentElement, Color.green_low_opacity);
      addOverlays(currentElement, time);
    }
  }

  // -----------------
  executedTasksArr.push(element.id);

  let taskArr = bpmnViewer.get('elementRegistry').filter(element => is(element, "bpmn:Task"));
  let task = taskArr.find(task => task.id === element.id);
  if(task) {
    let businessObj = getBusinessObject(task);
    let iotInputs = businessObj.get("dataInputAssociations")?.map(input => {
      if (input.sourceRef[0].type) {
        let elementToColor = bpmnViewer.get('elementRegistry').find(element => element.id === input.sourceRef[0].id);
        highlightElement(elementToColor, Color.green_full_opacity);
        return input.sourceRef[0].id;
      }
    });
    let iotOutputs = businessObj.get("dataOutputAssociations")?.map(input => {
      if(input.targetRef.type) {
        let elementToColor = bpmnViewer.get('elementRegistry').find(element => element.id === input.targetRef.id);
        highlightElement(elementToColor, Color.green_full_opacity);
        return input.targetRef.id;
      }
    });
    executedTasksArr.push(...iotInputs);
    executedTasksArr.push(...iotOutputs);
  }

  if(businessObj?.type === 'start' || businessObj?.type === 'catch' || businessObj?.type === 'throw') {
    let type = "";
    switch (businessObj.type){
      case 'start':
        type = "bpmn:IoTStartEvent";
        break;
      case 'catch':
        type = "bpmn:IoTIntermediateCatchEvent";
        break;
      case 'throw':
        type = "bpmn:IoTIntermediateThrowEvent";
        break;
    }

    fillSidebar("1", element.name, new Date().getTime(), "EndTime", element.id, type, "", "", "", "");
  } else {
    if(businessObj?.type !== 'end') {
      fillSidebar("1", element.name , new Date().getTime(), "EndTime", element.id, element.type, "", "", "", "");
    }
  }

})

const throwError = (api, id, msg) => {
  // Code um einen Boundary-Error zu "thrown"
  //api.owner.emitFatal({id: 'SomeId', message: 'thrown in wait'}, {id: waitObj.id});
  api.owner.emitFatal({id: id, message: msg}, {id: api.id});
}

const highlightErrorElements = (iotArtifact, waitObj, time, errormsg, source, boundary) => {
  if(boundary.length === 0) {
    engine.stop();
  }

  let element = bpmnViewer.get('elementRegistry').find(e => e.id === waitObj.id);

  if(iotArtifact) {
    let iotArtifactElement = bpmnViewer.get('elementRegistry').find(e => e.id === iotArtifact.id);
    highlightElement(iotArtifactElement, Color.red);
  }
  highlightElement(element, Color.red);
  let convertedTimeStamp = timestampToDate(waitObj.messageProperties.timestamp);
}

const timestampToDate = (timestamp) => {
  let date = new Date(timestamp);
  let convertTimestamp = date.getDate()+
      "/"+(date.getMonth()+1)+
      "/"+date.getFullYear()+
      " "+date.getHours()+
      ":"+(date.getMinutes()<10?'0':'') + date.getMinutes();

  return convertTimestamp;
}

function fillSidebarRightLog(msg) {
  let table = document.getElementById("overlayTableLogRight").getElementsByTagName("tbody")[0];
  let tableLength = table.rows.length;
  let row;
  if(tableLength > 100) {
    table.deleteRow(0);
    row = table.insertRow(tableLength -1);
  } else {
    row = table.insertRow(tableLength);
  }

  let text = row.insertCell(0);
  text.innerHTML = msg;

  scrollLogToBottom();
}

const scrollLogToBottom = () => {
  let div = document.getElementById("logDiv");
  div.scrollTop = div.scrollHeight - div.clientHeight;
}





function fillSidebar(processCase, label, timestamp, timestampType, id, type, connectedTo, responseValue, responseType, condition) {
  let table = document.getElementById("overlayTable").getElementsByTagName("tbody")[0];
  let tableLength = table.rows.length;
  let row = table.insertRow(tableLength);
  row.classList.add("text-center");

  let caseCell = row.insertCell(0);
  let labelCell = row.insertCell(1);
  let timestampCell = row.insertCell(2);
  let timestampTypeCell = row.insertCell(3);
  let idCell = row.insertCell(4);
  let typeCell  = row.insertCell(5);
  let connectedToCell = row.insertCell(6);
  let responseValueCell = row.insertCell(7);
  let responseTypeCell = row.insertCell(8);
  let conditionCell = row.insertCell(9);



  caseCell.innerHTML = processCase;
  labelCell.innerHTML = label ? label : '';
  timestampCell.innerHTML = timestamp;
  timestampTypeCell.innerHTML = timestampType;
  idCell.innerHTML = id;
  typeCell.innerHTML = type;
  connectedToCell.innerHTML = connectedTo
  responseValueCell.innerHTML = responseValue;
  responseTypeCell.innerHTML = responseType;
  conditionCell.innerHTML = condition;


  localStorage.setItem("log", localStorage.getItem("log") + "\n"+`${processCase};${label};${timestamp};${timestampType};${id};${type};${connectedTo};${responseValue};${responseType};${condition}`);
}

const addOverlays = (elem, time) => {
  overlays.add(elem, {
    html: '<div class="overlay">Time:'+ time/1000+' s</div>',
    position: {
      left: 0,
      top:0
    }
  });
};

const highlightElement = (elem, colorStr) => {
  elem.businessObject.di.set("fill", colorStr);
  const gfx = bpmnViewer.get("elementRegistry").getGraphics(elem);
  const type = elem.waypoints ? "connection" : "shape";
  bpmnViewer.get("graphicsFactory").update(type, elem, gfx);
};

const highlightElementArr = (elementArr, colorStr) => {
  elementArr.forEach((elem)=>highlightElement(elem, colorStr));
}

const resetView = () => {
  // clear executed task array
  executedTasksArr.length = 0;
  // Alle BPMN Elemente aus der elementRegistry holen
  let allElements = bpmnViewer.get('elementRegistry').filter((elem)=>elem.id);
  overlays.clear()
  // Schleife um alle BPMN Elemente wieder mit der Standardfarbe zu färben
  highlightElementArr(allElements, Color.white)

  document.getElementById("tableBody").innerHTML = "";
  document.getElementById("tableBodyLogRight").innerHTML = "";
}

runBtn.addEventListener('click', (event)=>{
  document.getElementById("mySidebarLog").style.display = "block";
  resetView();
  localStorage.setItem("log", 'Case;Label;Timestamp;TimestampType;ID;Type;ConnectedTo;ResponseValue;ResponseType;Condition');
  engine.execute({listener}).catch(e=>console.log(e));
})

document.getElementById('downloadLog').addEventListener('click', () => {

  let encodedUri = encodeURIComponent(localStorage.getItem("log"));
  let link = document.createElement("a");
  link.setAttribute("href", 'data:text/plain;charset=utf-8,' + encodedUri);
  link.setAttribute("download", "log_" + Date.now() +".csv");
  document.body.appendChild(link); // Required for FF

  link.click(); // This will download the data file named "my_data.csv".
})

document.getElementById('openbtn').addEventListener('click', (event)=>{
  document.getElementById("mySidebar").style.display = "block";
  document.getElementById("mySidebarLog").style.display = "none";
})

/* Set the width of the sidebar to 0 and the left margin of the page content to 0 */
document.getElementById('closebtn').addEventListener('click', (event)=>{
  document.getElementById("mySidebar").style.display = "none";
})

document.getElementById('closebtnRight').addEventListener('click', (event)=>{
  document.getElementById("mySidebarLog").style.display = "none";
})
