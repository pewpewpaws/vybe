declare module '@/data/carouselTracks' {
  export interface CarouselTrackData {
    id: string
    image: string
    name: string
    artists: string[]
  }

  export const rowOneTracks: CarouselTrackData[]
  export const rowTwoTracks: CarouselTrackData[]
  export const rowThreeTracks: CarouselTrackData[]
  export const loginCarouselRows: CarouselTrackData[][]

  export default loginCarouselRows
}
