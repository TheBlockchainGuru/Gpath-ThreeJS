import React, {useEffect, useRef, useState, Suspense} from 'react'
import {extend, Canvas} from '@react-three/fiber'
import {OrbitControls, TransformControls, useTexture, Line} from '@react-three/drei'
import * as THREE from 'three'
import pathStore from "../store/path";
import { Vector3 } from 'three';

// TODO: Get Point of Arc
function makeArc(center, start, end, isCW) {
  let temp = new THREE.Vector3(center.x + 10, center.y, center.z);
  let lineA = new THREE.Vector3();
  lineA.copy( temp ).sub( center );
  let lineB = new THREE.Vector3();
  lineB.copy( start ).sub( center );
  let lineC = new THREE.Vector3();
  lineC.copy( end ).sub( center );

  const abs_center = new THREE.Vector3().lerpVectors(start, end, 0.5);

  let positive = 1, positiveS = 1;
  if( (start.y < abs_center.y && start.x > abs_center.x) || (start.y < abs_center.y && start.x < abs_center.x) ) {
    if( center.y > start.y )
      positive = -1;
    if( center.x > abs_center.x )
      positiveS = -1;
  }

  if( (start.y > abs_center.y && start.x > abs_center.x) || (start.y > abs_center.y && start.x < abs_center.x) ) {
    if( center.y > start.y )
      positive = -1;
    if( center.x < abs_center.x )
      positiveS = -1;
  }

  const curve = new THREE.EllipseCurve(
    center.x, center.y,
    center.distanceTo(start), center.distanceTo(start),
    positive * lineA.angleTo(lineB), positive * lineA.angleTo(lineB) + positiveS * lineB.angleTo(lineC),
    isCW,
    0,
  );

  const points = curve.getPoints(100);
  return points;
}

// TODO: Get Center Point of Arc
function calcCenter(start, end, dis, x_f) {
  const center = new THREE.Vector3().lerpVectors(start, end, 0.5);

  const ang2Rad = (ang) => ang * Math.PI / 180;
  const rad2Ang = (rad) => rad * 180 / Math.PI;
  let y_f;
  if( (start.y > center.y && start.x > center.x) || (start.y < center.y && start.x < center.x) )
    y_f = -x_f;
  if( (start.y < center.y && start.x > center.x) || (start.y > center.y && start.x < center.x) )
    y_f = x_f;

  let lineA = new THREE.Vector3();
  lineA.copy(start).sub(center);
  let lineB = new THREE.Vector3();
  lineB.copy(new THREE.Vector3(center.x, center.y + 50, center.z)).sub(center);
  let subAng = 90 - rad2Ang( lineA.angleTo(lineB) );
  let offsetY = dis * Math.cos(ang2Rad(subAng));
  let offsetX = Math.sqrt(dis * dis - offsetY * offsetY);
  return new THREE.Vector3(center.x + x_f * offsetX, center.y + y_f * offsetY, center.z);
}

// TODO: Segment Component
function SegmentMesh ({segment, index, orbitRef}) {
  const mesh = useRef()
  const transform = useRef()
  const [hovered, setHovered] = useState(false)
  
  const getColor = () => {
    if (segment.editing) {
      return 0xfaa61a
    }
    if (hovered) {
      return 0x1e87f0
    }
    return 0x0562be
  }

  const updateSegment = pathStore(state => state.updateSegment)
  const shapes = pathStore(state => state.shapes)
  const segments = pathStore(state => state.segments)
  const updateShape = pathStore(state => state.updateShape);

  const canEnableZ = (index) => { // TODO: can show Z axis
    let res = true;
    shapes.forEach((shape) => {
      if(shape.command == 'Arc' && (shape.target_index == index || shape.target_index - 1 == index) )
        res = false;
    });
    return res;
  }

  useEffect(() => {

    const dragCallback = (event) => { // TODO: transform drag action
      orbitRef.current.enabled = !event.value

      const current = new Vector3(transform.current.children[1].position.x, transform.current.children[1].position.y, transform.current.children[1].position.z);
      if (!event.value) {
        updateSegment(index, {target: {
          x: current.x,
          y: current.y,
          z: current.z
        }})

        transform.current.update({offset: {x: 0, y: 0, z: 0}})

        shapes.forEach((shape, idx) => {
          if( (shape.command == 'Arc') && (shape.target_index == index || shape.target_index-1 == index) ) {
            let start, end;
            if( shape.target_index == index ) {
              start = new Vector3(current.x, current.y, current.z);
              end = new Vector3(segments[index-1].target.x, segments[index-1].target.y, segments[index-1].target.z);
            }
            if( shape.target_index - 1 == index ) {
              start = new Vector3(segments[index + 1].target.x, segments[index + 1].target.y, segments[index + 1].target.z);
              end = new Vector3(current.x, current.y, current.z);
            }

            const dis = shape.center.dis;
            const dir = shape.center.dir;

            const center = calcCenter(start, end, dis, dir);
            updateShape(idx, { center: {
              ...shape.center,
              x: center.x,
              y: center.y,
            } })
          }
        });
      }
    }
    transform.current.addEventListener('dragging-changed', dragCallback)

    return () => {
      transform.current.removeEventListener('dragging-changed', dragCallback)
    }
  })

  return (
    <TransformControls ref={transform} size={0.5} showX={segment.editing} showY={segment.editing} showZ={segment.editing && canEnableZ(index)} space='local'>
      <mesh
        ref={mesh}
        onClick={(e) => {updateSegment(index, {editing: !segment.editing}); e.stopPropagation()}}
        onPointerOver={(e) => setHovered(true)}
        onPointerOut={(e) => setHovered(false)}>
        <sphereGeometry args={[1]} />
        <meshStandardMaterial color={getColor()} />
      </mesh>
    </TransformControls>
  )
}

// TODO: Center Point of Arc Component
function CenterMesh ({point, orbitRef, index}) {
  const mesh = useRef()
  const transform = useRef()

  const getColor = () => {
    return 0xdd36b9
  }

  const updateShape = pathStore(state => state.updateShape);
  const shapes = pathStore(state => state.shapes);
  const segments = pathStore(state => state.segments);

  useEffect(() => {
    const dragCallback = (event) => {
      orbitRef.current.enabled = !event.value

      const seg_index = shapes[index].target_index;
      const start = new THREE.Vector3(segments[seg_index].target.x, segments[seg_index].target.y, segments[seg_index].target.z);
      const end = new THREE.Vector3(segments[seg_index - 1].target.x, segments[seg_index - 1].target.y, segments[seg_index - 1].target.z);
      const center = new THREE.Vector3().lerpVectors(start, end, 0.5);
      const current = new THREE.Vector3(transform.current.children[1].position.x, transform.current.children[1].position.y, transform.current.children[1].position.z);

      let x_f = current.x > center.x ? 1 : -1;

      const dis = current.distanceTo(center);
      const arc_center = calcCenter(start, end ,dis, x_f);

      transform.current.children[1].position.x = arc_center.x;
      transform.current.children[1].position.y = arc_center.y;
      transform.current.children[1].position.z = arc_center.z;

      if (!event.value) {
        if( !transform || !transform.current || !transform.current.children )
          return;

        updateShape(index, { center: {
          ...point,
          x: transform.current.children[1].position.x,
          y: transform.current.children[1].position.y,
          dis: dis,
          dir: x_f,
        } })

        transform.current.update({offset: {x: 0, y: 0, z: 0}})
      }
    }
    transform.current.addEventListener('dragging-changed', dragCallback)

    return () => {
      if( !transform || !transform.current ) return;
      transform.current.removeEventListener('dragging-changed', dragCallback)
    }
  })

  let points = [];
  let seg_index = shapes[index].target_index;
  points.push([ segments[seg_index - 1].target.x, segments[seg_index - 1].target.y, segments[seg_index - 1].target.z ])
  points.push([ point.x, point.y, point.z ])
  points.push([ segments[seg_index].target.x, segments[seg_index].target.y, segments[seg_index].target.z ])

  return (
    <mesh>
      <TransformControls ref={transform} size={0.5} showX={point.editing} showY={point.editing} showZ={false} position={[point.x, point.y, point.z]}>
        <mesh
          ref={mesh}
          onClick={(e) => { updateShape(index, { center: { ...point, editing: !point.editing } }); e.stopPropagation(); }}
          onDoubleClick={e => { updateShape(index, { direction: shapes[index].direction == 'CW' ? 'CCW' : 'CW' }); e.stopPropagation(); }}>
          <sphereGeometry args={[1]} />
          <meshStandardMaterial color={getColor()} />
        </mesh>
      </TransformControls>
      
      <Line points={points} color="red" lineWidth={2} dashed={true} />
    </mesh>
  )
}

// TODO: Background Image Component
function ReferenceImage({ canImgScale, orbitRef }) {
  const png = 'data:image/png;base64,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'
  const textureProps = useTexture({map: png})

  const updateImageScale = pathStore(state => state.updateImgScale)

  const transform = useRef()

  useEffect(() => {

    if (transform.current) {
      const { current: controls } = transform

      const objectCallback = (event) => {
        if( transform.current.object.scale.x > transform.current.object.scale.y)
          transform.current.object.scale.y = transform.current.object.scale.x;
        if( transform.current.object.scale.y > transform.current.object.scale.x)
          transform.current.object.scale.x = transform.current.object.scale.y;
      }

      const dragCallback = (event) => {
        orbitRef.current.enabled = !event.value
      }

      controls.addEventListener('dragging-changed', dragCallback)
      controls.addEventListener('objectChange', objectCallback)
      return () => {
        controls.removeEventListener('dragging-changed', dragCallback)
        controls.removeEventListener('objectChange', objectCallback)
      }
    }
  })

  return (
    <TransformControls ref={transform} space='local' mode="scale" showX={canImgScale} showY={canImgScale} showZ={false}  >
      <mesh onClick={ (e) => { updateImageScale(!canImgScale); e.stopPropagation(); } } position={[0,0, -1]}>
        <planeGeometry attach="geometry" color="white" args={[100, 100]} />
        <meshBasicMaterial {...textureProps} attach="material" transparent={true} side={THREE.DoubleSide} opacity={1} />
      </mesh>
    </TransformControls>
  )
}

// TODO: Shape Component (Line, Arc)
function DrawShape({index, shape, orbitRef}) {
  const transformShape = (index, shape) => {
    let start = segments[shape.target_index];
    let end = segments[shape.target_index - 1];
    if( start.editing && start.target.z == end.target.z ) {
      let newShape = {...shape};
      if(newShape.command == 'Line' ) {
        start = new THREE.Vector3( segments[shape.target_index].target.x, segments[shape.target_index].target.y, segments[shape.target_index].target.z );
        end = new THREE.Vector3( segments[shape.target_index-1].target.x, segments[shape.target_index-1].target.y, segments[shape.target_index-1].target.z );
  
        const center = calcCenter(start, end, 0, 1, 1);
  
        newShape.command = 'Arc'
        newShape.center = center;
        newShape.center.dir = 1;
        newShape.center.dis = 0;
      } else if( newShape.command == 'Arc' ) {
        newShape.command = 'Line';
        newShape.direction = 'CW';
        newShape.center = {};
      }
      updateShape(index, newShape);
    }
  }

  const segments = pathStore(state => state.segments)
  const updateShape = pathStore(state => state.updateShape);
  
  let points = [];
  let showCenter = false;

  points.push([ segments[shape.target_index].target.x, segments[shape.target_index].target.y, segments[shape.target_index].target.z ]);
  points.push([ segments[shape.target_index-1].target.x, segments[shape.target_index-1].target.y, segments[shape.target_index-1].target.z ]);
  if( shape.command == 'Arc' ) {
    const start = new THREE.Vector3(points[0][0], points[0][1], points[0][2]);
    const end = new THREE.Vector3(points[1][0], points[1][1], points[1][2]);

    const center = new THREE.Vector3(shape.center.x, shape.center.y, shape.center.z);
    const direction = shape.direction != 'CW';
    points = makeArc(center, start, end, direction);
    points = points.map((point) => {
      return [point.x, point.y, start.z]
    })

    showCenter = segments[shape.target_index].editing;
  }

  return (
    <mesh>
      <Line points={points} color="red" lineWidth={3} dashed={false} onClick={(e) => { transformShape(index, shape); e.stopPropagation() }} />
      {showCenter ? <CenterMesh point={shape.center} orbitRef={orbitRef} index={index} /> : null}
    </mesh>
  ) 
}

export default function Editor() {
  const orbit = useRef()
  const segments = pathStore(state => state.segments)
  const shapes = pathStore(state => state.shapes)
  const canImgScale = pathStore(state => state.imgScale)

  return (
    <Canvas style={{height: 650}} camera={{ position: [50, 10, 100], fov: 50 }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 0, 15]} intensity={1} />
      <gridHelper args={[100, 10]} rotation={[Math.PI / 2, 0, 0]} />

      <Suspense fallback={null}>
        <ReferenceImage canImgScale={canImgScale} orbitRef={orbit} />

        {segments.map((segment, i) =>
          <SegmentMesh key={i} segment={segment} index={i} orbitRef={orbit} />
        )}
        {shapes.map((shape, i) =>
          <DrawShape key={i} index={i} shape={shape} orbitRef={orbit} />
        )}
      </Suspense>
      <OrbitControls ref={orbit} dampingFactor={0.2} />
    </Canvas>
  )
}
