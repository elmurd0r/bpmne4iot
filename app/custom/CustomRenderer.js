import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import {getFillColor} from "bpmn-js/lib/draw/BpmnRenderUtil";


import {
  append as svgAppend,
  clear as svgClear,
  classes as svgClass,
  attr as svgAttr,
  create as svgCreate
} from 'tiny-svg';

import {
  getRoundRectPath
} from 'bpmn-js/lib/draw/BpmnRenderUtil';

import {
  is,
  getBusinessObject
} from 'bpmn-js/lib/util/ModelUtil';

import {isNil} from 'min-dash';
import {getSvg} from "./CustomUtil";
import Color from "./helper/Color";

const HIGH_PRIORITY = 9000,
      TASK_BORDER_RADIUS = 2;


export default class CustomRenderer extends BaseRenderer {
  constructor(eventBus, bpmnRenderer) {
    super(eventBus, HIGH_PRIORITY);

    this.eventBus = eventBus;
    this.bpmnRenderer = bpmnRenderer;
  }

  canRender(element) {
    // ignore labels
    return !element.labelTarget;
  }

  drawShape(parentNode, element) {
    const iotType = this.getIotType(element);

    const shape = this.bpmnRenderer.drawShape(parentNode, element);
    if (!isNil(iotType) && iotType) {

      let svg, color;

      switch (getFillColor(element)) {
        case Color.red:
          color = 'RED';
          break;
        case Color.green_low_opacity:
        case Color.green_full_opacity:
          color = 'GREEN';
          break;
        case Color.orange:
          color = 'ORANGE';
          break;
        default:
      }
      svg = getSvg(iotType, color);

      let svgElement = renderSVG(element.width, element.height, svg, color);
      svgClear(parentNode);
      svgAppend(parentNode, svgElement);
      return svgElement;
    }
    return shape;
  }

  getIotType(element) {
    const businessObject = getBusinessObject(element);
    const type = businessObject.get('iot:type');
    return type || null;
  }

  getShapePath(shape) {
    if (is(shape, 'bpmn:DataObjectReference')) {
      return getRoundRectPath(shape, TASK_BORDER_RADIUS);
    }

    return this.bpmnRenderer.getShapePath(shape);
  }
}

CustomRenderer.$inject = [ 'eventBus', 'bpmnRenderer'];

// helpers //////////

function renderSVG(width, height, svg, color) {
  let svgContainer = svgCreate(svg);
  svgAttr(svgContainer, {
    width: width,
    height: height
  });
  switch (color) {
    case Color.red:
      svgClass(svgContainer).add('svgColorRed');
      break;
    case Color.green_low_opacity:
      svgClass(svgContainer).add('svgColorGreen');
      break;
    default:
  }
  return svgContainer
}
