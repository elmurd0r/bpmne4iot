// Require your custom property entries.
import iotGroupBuilder from './parts/properties/IoTGroupBuilder';
import objSensorGroup from './parts/properties/ObjSensorGroupBuilder';
import objActuatorGroup from './parts/properties/ObjActuatorGroupBuilder';

let LOW_PRIORITY = 500;


// Create the custom magic tab.
// The properties are organized in groups.
function createIotTabGroups(element, bpmnFactory, elementRegistry, translate) {

    if(element?.businessObject?.type === "obj") {

        let iotSensor = {
            id: 'iot-sensor',
            label: 'Sensor',
            entries: []
        };
        let iotActuator = {
            id: 'iot-actuator',
            label: 'Actuator',
            entries: []
        };
        objSensorGroup(iotSensor, element, bpmnFactory, translate);
        objActuatorGroup(iotActuator, element, bpmnFactory, translate);

        return [
            iotSensor, iotActuator
        ];

    } else {

        // Create a group called "Black Magic".
        let iotGroup = {
            id: 'iot-group',
            label: 'IoT Group',
            entries: []
        };

        // Add the spell props to the black magic group.
        iotGroupBuilder(iotGroup, element, bpmnFactory, translate);

        return [
            iotGroup
        ];
    }
}

export default function IotPropertiesProvider(bpmnFactory, elementRegistry, propertiesPanel, translate) {
    // Register our custom magic properties provider.
    // Use a lower priority to ensure it is loaded after the basic BPMN properties.
    propertiesPanel.registerProvider(LOW_PRIORITY, this);

    this.getTabs = function(element) {

        return function(entries) {

            // Add the "magic" tab
            let iotTab = {
                id: 'iot',
                label: 'IoT',
                groups: createIotTabGroups(element, bpmnFactory, elementRegistry, translate)
            };

            entries.push(iotTab);

            // Show general + "iot" tab
            return entries;
        }
    };
}


IotPropertiesProvider.$inject = [ 'bpmnFactory', 'elementRegistry', 'propertiesPanel', 'translate' ]
