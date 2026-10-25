// src/lib/dataset-previews.ts
//
// A photograph for each catalogue card (homepage and /datasets), matched to
// what the dataset is about. Openly licensed (CC0, public domain or CC BY),
// found through Openverse; CC BY needs its credit shown, so every photo
// carries one and the cards print it. Files are in public/images/photos/,
// cropped to 16:10.

export interface DatasetPhoto { src: string; credit: string; licence: string; href: string }

/** Keyed by the catalogue card id in src/lib/supabase.ts (DATASETS). */
export const DATASET_PHOTO: Record<number, DatasetPhoto> = {
  1: { src: '/images/photos/dataset-1.webp', credit: "Openverse", licence: 'CC0', href: 'https://www.rawpixel.com/image/3284335/free-photo-image-aerial-field-view-cc0' },
  3: { src: '/images/photos/dataset-3.webp', credit: "Robert Taylor", licence: 'CC BY 4.0', href: 'https://www.inaturalist.org/photos/15744043' },
  4: { src: '/images/photos/dataset-4.webp', credit: "kewl", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/58411470@N00/54225803012' },
  5: { src: '/images/photos/dataset-5.webp', credit: "kewl", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/58411470@N00/54246652354' },
  6: { src: '/images/photos/dataset-6.webp', credit: "Dr.Faiyaz Alam", licence: 'Public domain', href: 'https://www.flickr.com/photos/33315479@N07/53540614711' },
  8: { src: '/images/photos/dataset-8.webp', credit: "scotted400", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/30557460@N05/54063471269' },
  9: { src: '/images/photos/dataset-9.webp', credit: "OregonDOT", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/28364885@N02/52184765274' },
  11: { src: '/images/photos/dataset-11.webp', credit: "vlitvinov", licence: 'CC0', href: 'https://www.flickr.com/photos/59724445@N07/52603673699' },
  12: { src: '/images/photos/dataset-12.webp', credit: "Openverse", licence: 'CC0', href: 'https://www.rawpixel.com/image/3337947/free-photo-image-animal-bush-cc0' },
  13: { src: '/images/photos/dataset-13.webp', credit: "flowcomm", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/21162417@N07/53173945510' },
  14: { src: '/images/photos/dataset-14.webp', credit: "John Brighenti", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/94359914@N06/51292590458' },
  15: { src: '/images/photos/dataset-15.webp', credit: "claralieu", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/189561381@N07/52466500208' },
  16: { src: '/images/photos/dataset-16.webp', credit: "cattan2011", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/68166820@N08/49615543796' },
  17: { src: '/images/photos/dataset-17.webp', credit: "cjlloyd_uk", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/96168186@N02/54372886558' },
  18: { src: '/images/photos/dataset-18.webp', credit: "JOHN K THORNE", licence: 'CC0', href: 'https://www.flickr.com/photos/89918055@N05/51380202278' },
  19: { src: '/images/photos/dataset-19.webp', credit: "Alabama Extension", licence: 'CC0', href: 'https://www.flickr.com/photos/184594136@N08/52719417121' },
  20: { src: '/images/photos/dataset-20.webp', credit: "GlacierNPS", licence: 'Public domain', href: 'https://www.flickr.com/photos/43288043@N04/51505361174' },
  21: { src: '/images/photos/dataset-21.webp', credit: "Darryl", licence: 'CC0', href: 'https://wordpress.org/photos/photo/61861f030e/' },
  22: { src: '/images/photos/dataset-22.webp', credit: "zakzak7", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/151836356@N08/34514872834' },
  23: { src: '/images/photos/dataset-23.webp', credit: "Openverse", licence: 'CC0', href: 'https://www.rawpixel.com/image/6036187/photo-image-public-domain-plant-nature' },
  24: { src: '/images/photos/dataset-24.webp', credit: "kuhnmi", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/31176607@N05/53479103457' },
  25: { src: '/images/photos/dataset-25.webp', credit: "PiktourUK", licence: 'CC BY 2.0', href: 'https://www.flickr.com/photos/69706441@N03/33610361012' },
}

export const photoFor = (id: number): DatasetPhoto | null => DATASET_PHOTO[id] ?? null
/** The image path alone, for places that only show the picture. */
export const previewFor = (id: number): string | null => DATASET_PHOTO[id]?.src ?? null
