# Dataset verification

| Dataset | Files | PASS | CHECK | FAIL |
|---|---|---|---|---|
| admin-boundaries | 51 | 51 | 0 | 0 |
| admin-boundaries:ADM1 | 51 | 50 | 1 | 0 |
| admin-boundaries:ADM2 | 49 | 48 | 1 | 0 |
| admin-boundaries:ADM3 | 25 | 23 | 2 | 0 |
| admin-boundaries:ADM4 | 3 | 3 | 0 | 0 |
| admin-boundaries:ADM5 | 2 | 1 | 0 | 1 |
| aquifer | 33 | 18 | 0 | 15 |
| climate:drought_index | 54 | 48 | 5 | 1 |
| climate:rainfall | 55 | 48 | 6 | 1 |
| climate:temperature | 54 | 53 | 1 | 0 |
| climate:temperature_worldclim_retired | 55 | 48 | 6 | 1 |
| hydrology:lakes | 50 | 50 | 0 | 0 |
| hydrology:rivers | 51 | 46 | 5 | 0 |
| hydrology:rivers_main | 51 | 49 | 0 | 2 |
| hydrology:watersheds | 52 | 44 | 7 | 1 |
| lulc | 52 | 48 | 1 | 3 |
| population | 33 | 32 | 1 | 0 |
| protected-areas | 50 | 47 | 0 | 3 |
| roads | 51 | 23 | 28 | 0 |
| soil | 54 | 53 | 1 | 0 |

## Problems

| Dataset | Country | Status | Note | inside | coverage |
|---|---|---|---|---|---|
| admin-boundaries:ADM3 | Burundi | CHECK | covers only 94% of the country | 0.984 | 0.94 |
| admin-boundaries:ADM5 | Central Africa Republic | FAIL | covers only 0% of the country | 0.999 | 0.0 |
| admin-boundaries:ADM1 | Seychelles | CHECK | covers only 92% of the country | 0.959 | 0.922 |
| admin-boundaries:ADM2 | Seychelles | CHECK | covers only 87% of the country | 0.937 | 0.873 |
| admin-boundaries:ADM3 | Seychelles | CHECK | covers only 87% of the country | 0.937 | 0.873 |
| hydrology:watersheds | Gambia | CHECK | covers only 94% of the country | 0.956 | 0.939 |
| hydrology:watersheds | Guinea-Bissau | CHECK | covers only 91% of the country | 0.985 | 0.907 |
| hydrology:watersheds | Morocco | CHECK | covers only 86% of the country | 0.998 | 0.863 |
| hydrology:watersheds | Seychelles | FAIL | only 46% inside the country; covers only 4% of the country | 0.463 | 0.036 |
| hydrology:watersheds | Somalia | CHECK | covers only 74% of the country | 0.989 | 0.737 |
| hydrology:rivers | Malawi | CHECK | only 77% inside the country | 0.771 | 1.0 |
| hydrology:watersheds | Malawi | CHECK | only 80% inside the country | 0.795 | 0.99 |
| hydrology:rivers | Rwanda | CHECK | only 76% inside the country | 0.76 | 1.0 |
| hydrology:rivers | Burundi | CHECK | only 82% inside the country | 0.816 | 1.0 |
| hydrology:rivers | Gambia | CHECK | only 77% inside the country | 0.774 | 1.0 |
| hydrology:rivers | Uganda | CHECK | only 83% inside the country | 0.828 | 1.0 |
| hydrology:watersheds | Comoros | CHECK | covers only 91% of the country | 0.966 | 0.914 |
| hydrology:watersheds | Egypt | CHECK | covers only 94% of the country | 0.997 | 0.935 |
| hydrology:rivers_main | Burundi | FAIL | only 49% inside the country | 0.488 | 0.486 |
| hydrology:rivers_main | Gambia | FAIL | only 56% inside the country | 0.558 | 0.714 |
| aquifer | Benin | FAIL | only 39% inside the country | 0.39 | 0.11 |
| aquifer | Cameroon | FAIL | only 30% inside the country | 0.302 | 0.004 |
| aquifer | Chad | FAIL | only 46% inside the country | 0.457 | 0.855 |
| aquifer | Congo | FAIL | only 38% inside the country | 0.376 | 0.023 |
| aquifer | Egypt | FAIL | only 32% inside the country | 0.324 | 0.859 |
| aquifer | Lesotho | FAIL | only 23% inside the country | 0.226 | 1.0 |
| aquifer | Libya | FAIL | only 50% inside the country | 0.502 | 0.205 |
| aquifer | Niger | FAIL | only 55% inside the country | 0.552 | 0.349 |
| aquifer | Senegal | FAIL | only 53% inside the country | 0.529 | 0.779 |
| aquifer | Somalia | FAIL | only 53% inside the country | 0.53 | 0.026 |
| aquifer | South Africa | FAIL | only 24% inside the country | 0.236 | 0.035 |
| aquifer | Tunisia | FAIL | only 53% inside the country | 0.532 | 0.17 |
| aquifer | Uganda | FAIL | only 38% inside the country | 0.378 | 0.089 |
| aquifer | Zambia | FAIL | only 43% inside the country | 0.429 | 0.065 |
| aquifer | Zimbabwe | FAIL | only 57% inside the country | 0.57 | 0.018 |
| lulc | Benin | FAIL | data covers only 68% of the country |  | 0.684 |
| lulc | Seychelles | FAIL | data covers only 42% of the country |  | 0.417 |
| lulc | Lesotho | CHECK | data covers only 78% of the country |  | 0.785 |
| lulc | Djibouti | FAIL | data covers only 34% of the country |  | 0.338 |
| climate:drought_index | Bir Tawil | CHECK | no country outline to compare with |  | 0.763 |
| climate:rainfall | Bir Tawil | CHECK | no country outline to compare with |  | 0.763 |
| climate:drought_index | Comoros | CHECK | data covers only 88% of the country |  | 0.88 |
| climate:rainfall | Comoros | CHECK | data covers only 88% of the country |  | 0.88 |
| climate:temperature_worldclim_retired | Bir Tawil | CHECK | no country outline to compare with |  | 0.752 |
| climate:rainfall | Cabo Verde | CHECK | data covers only 87% of the country |  | 0.868 |
| climate:drought_index | Somaliland | FAIL | data covers only 26% of the country |  | 0.263 |
| climate:rainfall | Somaliland | FAIL | data covers only 26% of the country |  | 0.263 |
| climate:drought_index | W Sahara | CHECK | no country outline to compare with |  | 0.151 |
| climate:rainfall | W Sahara | CHECK | no country outline to compare with |  | 0.151 |
| climate:drought_index | Somalia | CHECK | data covers only 74% of the country |  | 0.735 |
| climate:rainfall | Somalia | CHECK | data covers only 74% of the country |  | 0.735 |
| climate:drought_index | Morocco | CHECK | data covers only 88% of the country |  | 0.875 |
| climate:rainfall | Morocco | CHECK | data covers only 88% of the country |  | 0.875 |
| climate:temperature_worldclim_retired | Cabo Verde | CHECK | data covers only 89% of the country |  | 0.894 |
| climate:temperature_worldclim_retired | Somaliland | FAIL | data covers only 26% of the country |  | 0.264 |
| climate:temperature_worldclim_retired | W Sahara | CHECK | no country outline to compare with |  | 0.151 |
| climate:temperature_worldclim_retired | Tanzania | CHECK | values -1.35..27.76 outside 0..12000 |  | 0.995 |
| climate:temperature_worldclim_retired | Somalia | CHECK | data covers only 74% of the country |  | 0.736 |
| climate:temperature_worldclim_retired | Morocco | CHECK | data covers only 87% of the country |  | 0.874 |
| climate:temperature | Seychelles | CHECK | data covers only 76% of the country |  | 0.757 |
| population | Seychelles | CHECK | covers only 87% of the country | 0.937 | 0.873 |
| roads | Algeria | CHECK | reaches only 31% of the country | 0.999 | 0.312 |
| roads | Angola | CHECK | reaches only 27% of the country | 1.0 | 0.267 |
| roads | Botswana | CHECK | reaches only 32% of the country | 0.998 | 0.321 |
| roads | Burkina Faso | CHECK | reaches only 48% of the country | 0.998 | 0.482 |
| roads | Central African Republic | CHECK | reaches only 39% of the country | 0.997 | 0.389 |
| roads | Chad | CHECK | reaches only 29% of the country | 0.998 | 0.287 |
| roads | Congo | CHECK | reaches only 21% of the country | 0.995 | 0.206 |
| roads | Democratic Republic of the Congo | CHECK | reaches only 26% of the country | 0.999 | 0.261 |
| roads | Egypt | CHECK | reaches only 37% of the country | 0.995 | 0.373 |
| roads | Eritrea | CHECK | reaches only 43% of the country | 0.992 | 0.429 |
| roads | Ethiopia | CHECK | reaches only 40% of the country | 0.999 | 0.401 |
| roads | Gabon | CHECK | reaches only 27% of the country | 0.989 | 0.268 |
| roads | Guinea-Bissau | CHECK | reaches only 38% of the country | 0.998 | 0.375 |
| roads | Lesotho | CHECK | reaches only 47% of the country | 0.982 | 0.467 |
| roads | Liberia | CHECK | reaches only 45% of the country | 0.997 | 0.452 |
| roads | Libya | CHECK | reaches only 32% of the country | 1.0 | 0.322 |
| roads | Madagascar | CHECK | reaches only 42% of the country | 0.993 | 0.422 |
| roads | Mali | CHECK | reaches only 28% of the country | 0.997 | 0.276 |
| roads | Mauritania | CHECK | reaches only 22% of the country | 0.994 | 0.225 |
| roads | Morocco | CHECK | reaches only 48% of the country | 0.999 | 0.477 |
| roads | Mozambique | CHECK | reaches only 39% of the country | 0.998 | 0.39 |
| roads | Namibia | CHECK | reaches only 37% of the country | 1.0 | 0.366 |
| roads | Niger | CHECK | reaches only 29% of the country | 0.999 | 0.292 |
| roads | Somalia | CHECK | reaches only 31% of the country | 0.996 | 0.309 |
| roads | South Sudan | CHECK | reaches only 35% of the country | 0.995 | 0.347 |
| roads | Sudan | CHECK | reaches only 33% of the country | 0.994 | 0.327 |
| roads | Tanzania | CHECK | reaches only 48% of the country | 0.993 | 0.479 |
| roads | Zambia | CHECK | reaches only 28% of the country | 0.997 | 0.278 |
| soil | Seychelles | CHECK | data covers only 73% of the country |  | 0.726 |
| protected-areas | Mauritania | FAIL | only 50% inside the country | 0.499 | 0.005 |
| protected-areas | Seychelles | FAIL | only 12% inside the country | 0.12 | 0.006 |
| protected-areas | Somalia | FAIL | only 0% inside the country | 0.0 | 0.0 |
