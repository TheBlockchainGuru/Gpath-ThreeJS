import create from "zustand"
import produce from "immer";

const pathStore = create(set => ({
  shapes: [],
  segments: [],
  imgScale: false, 
  createSegment: (id, delta) => set(produce(state => {
    state.segments.push({
      command: 'G01',
      target: {x: 0, y: 0, z: 0},
      editing: false,
    })
    if( state.segments.length > 1 ) {
      state.shapes.push({
        command: 'Line',
        target_index: state.segments.length - 1,
        direction: 'CW',
        center: {},
      })
    }
  })),
  updateSegment: (id, delta) => set(produce(state => {
    state.segments[id] = {...state.segments[id], ...delta}
  })),
  updateImgScale: (value) => set(produce(state => {
    state.imgScale = value
  })),
  updateShape: (idx, data) => set(produce(state => {
    state.shapes[idx] = { ...state.shapes[idx], ...data }
  })),
}))

export default pathStore
