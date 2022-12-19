import entryFactory from 'bpmn-js-properties-panel/lib/factory/EntryFactory';

import {
    getBusinessObject,
    is
} from 'bpmn-js/lib/util/ModelUtil';
import {isNil} from "min-dash";
import properties from "./CustomIoTProperties";
import elementHelper from "bpmn-js-properties-panel/lib/helper/ElementHelper";
import cmdHelper from "bpmn-js-properties-panel/lib/helper/CmdHelper";



export default function(group, element, bpmnFactory, translate) {

    // Only return an entry, if the currently selected
    // element is a start event.
    const iotType = getIotType(element);

    let modelProps, labels;
    if(iotType === 'sensor') {
        modelProps = [ 'url', 'key'];
        labels = [ translate('Url'), translate('Key')];
    }
    if(iotType === 'sensor-sub') {
        modelProps = ['url', 'key', 'name'];
        labels = [ translate('Url'), translate('Key'), translate('Name')];
    }

    if(iotType === 'start' || iotType === 'catch' || iotType === 'artefact-catch') {
        modelProps = [ 'url', 'key', 'mathOP', 'value' ];
        labels = [ translate('Url'), translate('Key'), translate('MathOP (<, =, >)'), translate('Value') ];
        if( iotType === 'start' || iotType === 'catch') {
            modelProps.push('timeout');
            labels.push('timeout');
        }
    }
    if(iotType === 'artefact-catch-sub') {
        modelProps = [ 'url', 'key', 'mathOP', 'value', 'name' ];
        labels = [ translate('Url'), translate('Key'), translate('MathOP (<, =, >)'), translate('Value'), translate('Name') ];
    }
    if(iotType === 'actor' || iotType === 'actor-sub' || iotType === 'throw' || iotType === 'end') {
        modelProps = [ 'url', 'method' ];
        labels = [ translate('Url'), translate('Method')];
    }

    if(iotType === 'obj') {
        //TODO: implement correct way, this is temporary to prevent errors.
        modelProps = ['url'];
        labels = [ translate('Url')];
    }

    if ((is(element, 'bpmn:DataObjectReference') || is(element, 'bpmn:StartEvent') || is(element, 'bpmn:IntermediateCatchEvent') || is(element, 'bpmn:IntermediateThrowEvent')) && !isNil(iotType) || is(element, 'bpmn:EndEvent') && !isNil(iotType)) {

        let propertiesEntry = properties(iotType, element, bpmnFactory, {
            id: 'IoTproperties',
            modelProperties: modelProps,
            labels: labels,

            getParent: function(element, node, bo) {
                return bo.extensionElements;
            },

            createParent: function(element, bo) {
                let parent = elementHelper.createElement('bpmn:ExtensionElements', {values: []}, bo, bpmnFactory);
                let cmd = cmdHelper.updateBusinessObject(element, bo, {extensionElements: parent});
                return {
                    cmd: cmd,
                    parent: parent
                };
            }
        }, translate);

        if (propertiesEntry) {
            group.entries.push(propertiesEntry);
        }

    }
}

function getIotType(element) {
    const businessObject = getBusinessObject(element);

    const type = businessObject.get('iot:type');

    return type ? type : null;
}
