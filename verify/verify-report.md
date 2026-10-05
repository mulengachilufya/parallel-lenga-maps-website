# Dataset verification

| Dataset | Files | PASS | CHECK | FAIL |
|---|---|---|---|---|
| admin-boundaries | 51 | 51 | 0 | 0 |
| admin-boundaries:ADM1 | 51 | 50 | 1 | 0 |
| admin-boundaries:ADM2 | 49 | 48 | 1 | 0 |
| admin-boundaries:ADM3 | 25 | 23 | 2 | 0 |
| admin-boundaries:ADM4 | 3 | 3 | 0 | 0 |
| admin-boundaries:ADM5 | 2 | 1 | 0 | 1 |
| aquifer | 33 | 16 | 2 | 15 |
| climate:drought_index | 54 | 2 | 43 | 9 |
| climate:rainfall | 55 | 41 | 5 | 9 |
| climate:temperature | 55 | 41 | 5 | 9 |
| hydrology:lakes | 50 | 38 | 5 | 7 |
| hydrology:rivers | 51 | 40 | 11 | 0 |
| hydrology:watersheds | 52 | 39 | 12 | 1 |
| lulc | 34 | 6 | 13 | 15 |
| population | 33 | 30 | 3 | 0 |
| protected-areas | 50 | 42 | 5 | 3 |
| roads | 51 | 20 | 31 | 0 |

## Problems

| Dataset | Country | Status | Note | inside | coverage |
|---|---|---|---|---|---|
| admin-boundaries:ADM3 | Burundi | CHECK | covers only 94% of the country | 0.984 | 0.94 |
| admin-boundaries:ADM5 | Central Africa Republic | FAIL | covers only 0% of the country | 0.999 | 0.0 |
| admin-boundaries:ADM1 | Seychelles | CHECK | covers only 92% of the country | 0.959 | 0.922 |
| admin-boundaries:ADM2 | Seychelles | CHECK | covers only 87% of the country | 0.937 | 0.873 |
| admin-boundaries:ADM3 | Seychelles | CHECK | covers only 87% of the country | 0.937 | 0.873 |
| hydrology:watersheds | Gambia | CHECK | covers only 94% of the country | 0.956 | 0.939 |
| hydrology:watersheds | Guinea-Bissau | CHECK | no country outline to compare with |  |  |
| hydrology:watersheds | Morocco | CHECK | covers only 86% of the country | 0.998 | 0.863 |
| hydrology:watersheds | Sao Tome and Principe | CHECK | no country outline to compare with |  |  |
| hydrology:watersheds | Seychelles | FAIL | only 46% inside the country; covers only 4% of the country | 0.463 | 0.036 |
| hydrology:watersheds | Somalia | CHECK | covers only 74% of the country | 0.989 | 0.737 |
| hydrology:rivers | Central African Republic | CHECK | no country outline to compare with |  |  |
| hydrology:rivers | Malawi | CHECK | only 77% inside the country | 0.771 | 1.0 |
| hydrology:watersheds | Malawi | CHECK | only 80% inside the country | 0.795 | 0.99 |
| hydrology:rivers | Democratic Republic of the Congo | CHECK | no country outline to compare with |  |  |
| hydrology:rivers | Cote d'Ivoire | CHECK | no country outline to compare with |  |  |
| hydrology:rivers | Equatorial Guinea | CHECK | no country outline to compare with |  |  |
| hydrology:rivers | Rwanda | CHECK | only 76% inside the country | 0.76 | 1.0 |
| hydrology:rivers | Sao Tome and Principe | CHECK | no country outline to compare with |  |  |
| hydrology:lakes | Burundi | FAIL | only 12% inside the country | 0.124 | 0.011 |
| hydrology:lakes | Central African Republic | CHECK | no country outline to compare with |  |  |
| hydrology:lakes | Democratic Republic of the Congo | CHECK | no country outline to compare with |  |  |
| hydrology:lakes | Cote d'Ivoire | CHECK | no country outline to compare with |  |  |
| hydrology:lakes | Equatorial Guinea | CHECK | no country outline to compare with |  |  |
| hydrology:lakes | Ethiopia | FAIL | only 57% inside the country | 0.571 | 0.004 |
| hydrology:lakes | Guinea-Bissau | CHECK | no country outline to compare with |  |  |
| hydrology:lakes | Liberia | FAIL | only 30% inside the country | 0.3 | 0.001 |
| hydrology:lakes | Malawi | FAIL | only 6% inside the country | 0.065 | 0.016 |
| hydrology:lakes | Rwanda | FAIL | only 1% inside the country | 0.006 | 0.0 |
| hydrology:lakes | Tanzania | FAIL | only 17% inside the country | 0.17 | 0.012 |
| hydrology:lakes | Uganda | FAIL | only 11% inside the country | 0.113 | 0.02 |
| hydrology:rivers | Burundi | CHECK | only 82% inside the country | 0.816 | 1.0 |
| hydrology:rivers | Gambia | CHECK | only 77% inside the country | 0.774 | 1.0 |
| hydrology:rivers | Guinea-Bissau | CHECK | no country outline to compare with |  |  |
| hydrology:rivers | Uganda | CHECK | only 83% inside the country | 0.828 | 1.0 |
| hydrology:watersheds | Central African Republic | CHECK | no country outline to compare with |  |  |
| hydrology:watersheds | Comoros | CHECK | covers only 91% of the country | 0.966 | 0.914 |
| hydrology:watersheds | Democratic Republic of the Congo | CHECK | no country outline to compare with |  |  |
| hydrology:watersheds | Cote d'Ivoire | CHECK | no country outline to compare with |  |  |
| hydrology:watersheds | Egypt | CHECK | covers only 94% of the country | 0.997 | 0.935 |
| hydrology:watersheds | Equatorial Guinea | CHECK | no country outline to compare with |  |  |
| aquifer | Benin | FAIL | only 39% inside the country | 0.39 | 0.11 |
| aquifer | Cameroon | FAIL | only 30% inside the country | 0.302 | 0.004 |
| aquifer | Chad | FAIL | only 46% inside the country | 0.457 | 0.855 |
| aquifer | Congo | FAIL | only 38% inside the country | 0.376 | 0.023 |
| aquifer | Democratic Republic of the Congo | CHECK | no country outline to compare with |  |  |
| aquifer | Egypt | FAIL | only 32% inside the country | 0.324 | 0.859 |
| aquifer | Ivory Coast | CHECK | no country outline to compare with |  |  |
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
| lulc | Ghana | CHECK | data covers only 84% of the country |  | 0.844 |
| lulc | Guinea | CHECK | data covers only 85% of the country |  | 0.851 |
| lulc | Malawi | CHECK | data covers only 74% of the country |  | 0.743 |
| lulc | Namibia | FAIL | data covers only 25% of the country |  | 0.251 |
| lulc | Tunisia | CHECK | data covers only 71% of the country |  | 0.707 |
| lulc | Burkina Faso | FAIL | data covers only 55% of the country |  | 0.553 |
| lulc | Uganda | CHECK | data covers only 85% of the country |  | 0.846 |
| lulc | Zimbabwe | CHECK | data covers only 86% of the country |  | 0.858 |
| lulc | Tanzania | CHECK | data covers only 81% of the country |  | 0.805 |
| lulc | Sao Tome and Principe | FAIL | data covers only 5% of the country |  | 0.05 |
| lulc | Seychelles | FAIL | data covers only 42% of the country |  | 0.417 |
| lulc | Gabon | FAIL | data covers only 16% of the country |  | 0.156 |
| lulc | Cabo Verde | CHECK | data covers only 75% of the country |  | 0.747 |
| lulc | Equatorial Guinea | FAIL | data covers only 26% of the country |  | 0.261 |
| lulc | Burundi | FAIL | data covers only 27% of the country |  | 0.265 |
| lulc | Lesotho | CHECK | data covers only 78% of the country |  | 0.785 |
| lulc | Eswatini | CHECK | data covers only 81% of the country |  | 0.813 |
| lulc | Sierra Leone | FAIL | data covers only 30% of the country |  | 0.297 |
| lulc | Liberia | FAIL | data covers only 65% of the country |  | 0.647 |
| lulc | Senegal | FAIL | data covers only 31% of the country |  | 0.309 |
| lulc | Eritrea | FAIL | data covers only 61% of the country |  | 0.609 |
| lulc | Cameroon | FAIL | data covers only 28% of the country |  | 0.281 |
| lulc | Mauritania | FAIL | data covers only 9% of the country |  | 0.09 |
| lulc | Djibouti | FAIL | data covers only 34% of the country |  | 0.338 |
| lulc | Guinea-Bissau | CHECK | data covers only 75% of the country |  | 0.745 |
| lulc | Ivory Coast | CHECK | data covers only 75% of the country |  | 0.75 |
| lulc | Congo | CHECK | data covers only 75% of the country |  | 0.745 |
| climate:drought_index | Bir Tawil | CHECK | values -1.29..1.34 outside 0..12000; data covers only 76% of the country |  | 0.763 |
| climate:rainfall | Bir Tawil | CHECK | data covers only 76% of the country |  | 0.763 |
| climate:temperature | Bir Tawil | CHECK | data covers only 75% of the country |  | 0.752 |
| climate:drought_index | Comoros | CHECK | values -1.07..1.44 outside 0..12000; data covers only 88% of the country |  | 0.88 |
| climate:rainfall | Comoros | CHECK | data covers only 88% of the country |  | 0.88 |
| climate:drought_index | Sao Tome and Principe | FAIL | values -1.2..0.12 outside 0..12000; data covers only 8% of the country |  | 0.076 |
| climate:rainfall | Sao Tome and Principe | FAIL | data covers only 8% of the country |  | 0.076 |
| climate:drought_index | Gambia | CHECK | values -1.15..0.84 outside 0..12000 |  | 0.951 |
| climate:temperature | Sao Tome and Principe | FAIL | data covers only 7% of the country |  | 0.068 |
| climate:drought_index | Djibouti | CHECK | values -0.29..1.56 outside 0..12000 |  | 0.975 |
| climate:drought_index | Rwanda | CHECK | values -1.03..1.09 outside 0..12000 |  | 0.966 |
| climate:drought_index | Burundi | CHECK | values -0.67..3.0 outside 0..12000 |  | 0.972 |
| climate:drought_index | Lesotho | CHECK | values -0.17..1.24 outside 0..12000 |  | 0.984 |
| climate:drought_index | Guinea Bissau | FAIL | values -0.7..1.21 outside 0..12000; data covers only 59% of the country |  | 0.589 |
| climate:rainfall | Guinea Bissau | FAIL | data covers only 59% of the country |  | 0.589 |
| climate:rainfall | Cabo Verde | CHECK | data covers only 87% of the country |  | 0.868 |
| climate:temperature | Guinea Bissau | FAIL | data covers only 57% of the country |  | 0.569 |
| climate:temperature | Cabo Verde | CHECK | data covers only 89% of the country |  | 0.894 |
| climate:drought_index | Sierra Leone | CHECK | values -0.09..2.74 outside 0..12000 |  | 0.985 |
| climate:drought_index | Liberia | CHECK | values -2.6..1.83 outside 0..12000 |  | 0.987 |
| climate:drought_index | Benin | CHECK | values -1.17..2.07 outside 0..12000 |  | 0.988 |
| climate:drought_index | Somaliland | FAIL | values -0.88..3.0 outside 0..12000; data covers only 64% of the country |  | 0.636 |
| climate:rainfall | Somaliland | FAIL | data covers only 64% of the country |  | 0.636 |
| climate:drought_index | Malawi | CHECK | values -0.81..1.29 outside 0..12000 |  | 0.979 |
| climate:drought_index | Senegal | CHECK | values -1.37..1.98 outside 0..12000 |  | 0.988 |
| climate:drought_index | Ghana | CHECK | values -1.24..2.69 outside 0..12000 |  | 0.994 |
| climate:drought_index | Tunisia | CHECK | values -1.42..0.72 outside 0..12000 |  | 0.989 |
| climate:drought_index | Eq Guinea | FAIL | values -1.94..-0.36 outside 0..12000; data covers only 8% of the country |  | 0.079 |
| climate:rainfall | Eq Guinea | FAIL | data covers only 8% of the country |  | 0.079 |
| climate:drought_index | Uganda | CHECK | values -2.73..1.18 outside 0..12000 |  | 0.988 |
| climate:temperature | Somaliland | FAIL | data covers only 63% of the country |  | 0.633 |
| climate:drought_index | Gabon | CHECK | values -1.93..3.0 outside 0..12000 |  | 0.991 |
| climate:drought_index | Eritrea | CHECK | values -1.12..3.0 outside 0..12000 |  | 0.98 |
| climate:drought_index | Cote dIvoire | FAIL | values -3.0..3.0 outside 0..12000; data covers only 69% of the country |  | 0.685 |
| climate:rainfall | Cote dIvoire | FAIL | data covers only 69% of the country |  | 0.685 |
| climate:drought_index | Guinea | CHECK | values -2.59..2.53 outside 0..12000 |  | 0.987 |
| climate:temperature | Eq Guinea | FAIL | data covers only 8% of the country |  | 0.075 |
| climate:drought_index | Burkina Faso | CHECK | values -2.49..1.53 outside 0..12000 |  | 0.992 |
| climate:drought_index | Zimbabwe | CHECK | values -1.84..1.4 outside 0..12000 |  | 0.995 |
| climate:temperature | Cote dIvoire | FAIL | data covers only 69% of the country |  | 0.688 |
| climate:drought_index | W Sahara | FAIL | values -0.94..1.68 outside 0..12000; data covers only 15% of the country |  | 0.151 |
| climate:rainfall | W Sahara | FAIL | data covers only 15% of the country |  | 0.151 |
| climate:drought_index | Congo | CHECK | values -1.45..3.0 outside 0..12000 |  | 0.99 |
| climate:drought_index | Kenya | CHECK | values -0.98..3.0 outside 0..12000 |  | 0.987 |
| climate:temperature | W Sahara | FAIL | data covers only 15% of the country |  | 0.151 |
| climate:drought_index | Botswana | CHECK | values -1.87..-0.27 outside 0..12000 |  | 0.995 |
| climate:drought_index | Cameroon | CHECK | values -1.73..3.0 outside 0..12000 |  | 0.992 |
| climate:drought_index | Madagascar | CHECK | values -1.71..1.93 outside 0..12000 |  | 0.994 |
| climate:drought_index | S Sudan | FAIL | values -2.76..3.0 outside 0..12000; data covers only 51% of the country |  | 0.506 |
| climate:rainfall | S Sudan | FAIL | data covers only 51% of the country |  | 0.506 |
| climate:drought_index | Central African Rep | FAIL | values -1.48..3.0 outside 0..12000; data covers only 45% of the country |  | 0.448 |
| climate:rainfall | Central African Rep | FAIL | data covers only 45% of the country |  | 0.448 |
| climate:drought_index | Nigeria | CHECK | values -2.37..2.88 outside 0..12000 |  | 0.995 |
| climate:drought_index | Zambia | CHECK | values -2.56..3.0 outside 0..12000 |  | 0.995 |
| climate:drought_index | Egypt | CHECK | values -2.55..3.0 outside 0..12000 |  | 0.996 |
| climate:drought_index | Tanzania | CHECK | values -1.1..3.0 outside 0..12000 |  | 0.994 |
| climate:drought_index | Somalia | CHECK | values -0.86..3.0 outside 0..12000; data covers only 74% of the country |  | 0.735 |
| climate:rainfall | Somalia | CHECK | data covers only 74% of the country |  | 0.735 |
| climate:temperature | S Sudan | FAIL | data covers only 50% of the country |  | 0.503 |
| climate:drought_index | Mauritania | CHECK | values -2.48..2.88 outside 0..12000 |  | 0.996 |
| climate:drought_index | Namibia | CHECK | values -1.86..3.0 outside 0..12000 |  | 0.996 |
| climate:temperature | Central African Rep | FAIL | data covers only 45% of the country |  | 0.448 |
| climate:drought_index | Chad | CHECK | values -2.52..3.0 outside 0..12000 |  | 0.993 |
| climate:drought_index | Angola | CHECK | values -2.4..3.0 outside 0..12000 |  | 0.976 |
| climate:drought_index | Ethiopia | CHECK | values -2.43..3.0 outside 0..12000 |  | 0.995 |
| climate:temperature | Tanzania | CHECK | values -1.35..27.76 outside 0..12000 |  | 0.995 |
| climate:drought_index | Mozambique | CHECK | values -1.15..2.92 outside 0..12000 |  | 0.994 |
| climate:drought_index | Niger | CHECK | values -2.6..3.0 outside 0..12000 |  | 0.997 |
| climate:temperature | Somalia | CHECK | data covers only 74% of the country |  | 0.736 |
| climate:drought_index | Libya | CHECK | values -2.2..3.0 outside 0..12000 |  | 0.998 |
| climate:drought_index | Sudan | CHECK | values -3.0..3.0 outside 0..12000 |  | 0.987 |
| climate:drought_index | Morocco | CHECK | values -2.3..2.54 outside 0..12000; data covers only 88% of the country |  | 0.875 |
| climate:rainfall | Morocco | CHECK | data covers only 88% of the country |  | 0.875 |
| climate:drought_index | Mali | CHECK | values -3.0..2.58 outside 0..12000 |  | 0.996 |
| climate:temperature | Morocco | CHECK | data covers only 87% of the country |  | 0.874 |
| climate:drought_index | Dem Rep Congo | FAIL | values -3.0..3.0 outside 0..12000; data covers only 53% of the country |  | 0.532 |
| climate:rainfall | Dem Rep Congo | FAIL | data covers only 53% of the country |  | 0.532 |
| climate:drought_index | Algeria | CHECK | values -3.0..1.95 outside 0..12000 |  | 0.998 |
| climate:drought_index | South Africa | CHECK | values -2.12..3.0 outside 0..12000 |  | 0.996 |
| climate:temperature | Dem Rep Congo | FAIL | data covers only 53% of the country |  | 0.532 |
| population | DR Congo | CHECK | no country outline to compare with |  |  |
| population | Sao Tome and Principe | CHECK | no country outline to compare with |  |  |
| population | Seychelles | CHECK | covers only 87% of the country | 0.937 | 0.873 |
| roads | Algeria | CHECK | reaches only 31% of the country | 0.999 | 0.312 |
| roads | Angola | CHECK | reaches only 27% of the country | 1.0 | 0.267 |
| roads | Botswana | CHECK | reaches only 32% of the country | 0.998 | 0.321 |
| roads | Burkina Faso | CHECK | reaches only 48% of the country | 0.998 | 0.482 |
| roads | Central African Republic | CHECK | no country outline to compare with |  |  |
| roads | Chad | CHECK | reaches only 29% of the country | 0.998 | 0.287 |
| roads | Congo | CHECK | reaches only 21% of the country | 0.995 | 0.206 |
| roads | Democratic Republic of the Congo | CHECK | no country outline to compare with |  |  |
| roads | Cote d'Ivoire | CHECK | no country outline to compare with |  |  |
| roads | Egypt | CHECK | reaches only 37% of the country | 0.995 | 0.373 |
| roads | Equatorial Guinea | CHECK | no country outline to compare with |  |  |
| roads | Eritrea | CHECK | reaches only 43% of the country | 0.992 | 0.429 |
| roads | Ethiopia | CHECK | reaches only 40% of the country | 0.999 | 0.401 |
| roads | Gabon | CHECK | reaches only 27% of the country | 0.989 | 0.268 |
| roads | Guinea-Bissau | CHECK | no country outline to compare with |  |  |
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
| roads | Sao Tome and Principe | CHECK | no country outline to compare with |  |  |
| roads | Somalia | CHECK | reaches only 31% of the country | 0.996 | 0.309 |
| roads | South Sudan | CHECK | reaches only 35% of the country | 0.995 | 0.347 |
| roads | Sudan | CHECK | reaches only 33% of the country | 0.994 | 0.327 |
| roads | Tanzania | CHECK | reaches only 48% of the country | 0.993 | 0.479 |
| roads | Zambia | CHECK | reaches only 28% of the country | 0.997 | 0.278 |
| protected-areas | Central African Republic | CHECK | no country outline to compare with |  |  |
| protected-areas | Democratic Republic of the Congo | CHECK | no country outline to compare with |  |  |
| protected-areas | Cote d'Ivoire | CHECK | no country outline to compare with |  |  |
| protected-areas | Equatorial Guinea | CHECK | no country outline to compare with |  |  |
| protected-areas | Guinea-Bissau | CHECK | no country outline to compare with |  |  |
| protected-areas | Mauritania | FAIL | only 50% inside the country | 0.499 | 0.005 |
| protected-areas | Seychelles | FAIL | only 12% inside the country | 0.12 | 0.006 |
| protected-areas | Somalia | FAIL | only 0% inside the country | 0.0 | 0.0 |
