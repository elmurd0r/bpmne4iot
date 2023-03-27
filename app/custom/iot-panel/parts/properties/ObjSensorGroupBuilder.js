import properties from "../entries/ObjSensorProperties";
import elementHelper from "bpmn-js-properties-panel/lib/helper/ElementHelper";
import cmdHelper from "bpmn-js-properties-panel/lib/helper/CmdHelper";

export default function(group, element, bpmnFactory, translate) {
    let propertiesEntry = properties(element, bpmnFactory, {
        id: 'IoTproperties-sensor',
        modelProperties: [ 'url', 'key' ],
        labels: [ translate('Url'), translate('Key')],

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