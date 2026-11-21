import type { MediaType } from '~~/shared/utils/library/types'

export interface CatalogEntry {
  id: string
  type: MediaType
  name: string
  tmdbId?: number
  firstAired: string
  posterPath: string
  backdropPath: string
}

export const catalog: CatalogEntry[] = [
  { id: 'tulsa-king', type: 'tv', name: 'Tulsa King', tmdbId: 153312, firstAired: '2022-11-13', posterPath: '/y13WOeZ2rz2Ezpws0RJ0I8sQpG4.jpg', backdropPath: '/mNHRGO1gFpR2CYZdANe72kcKq7G.jpg' },
  { id: 'reacher', type: 'tv', name: 'Reacher', tmdbId: 108978, firstAired: '2022-02-03', posterPath: '/f1VCQIG2iCyOookdgOzwtUpwWC0.jpg', backdropPath: '/pF0qkRsrHkdYadPWY9AMeFZfcwk.jpg' },
  { id: 'landman', type: 'tv', name: 'Landman', tmdbId: 157741, firstAired: '2024-11-17', posterPath: '/hYthRgS1nvQkGILn9YmqsF8kSk6.jpg', backdropPath: '/mh2UczqEXJJVgqohbyZbHTuxwhL.jpg' },
  { id: 'arcane', type: 'tv', name: 'Arcane', tmdbId: 94605, firstAired: '2021-11-06', posterPath: '/87C0wecB8bHb1PsrKBI4kJiEkgV.jpg', backdropPath: '/5cvnxEHT3e39DvT6ARw4GNCFrB0.jpg' },
  { id: 'the-mandalorian', type: 'tv', name: 'The Mandalorian', tmdbId: 82856, firstAired: '2019-11-12', posterPath: '/sWgBv7LV2PRoQgkxwlibdGXKz1S.jpg', backdropPath: '/9zcbqSxdsRMZWHYtyCd1nXPr2xq.jpg' },
  { id: 'motherland-fort-salem', type: 'tv', name: 'Motherland: Fort Salem', tmdbId: 91977, firstAired: '2020-03-18', posterPath: '/s2dBDw3ns9rss51ikDtcINehMQM.jpg', backdropPath: '/jJUSFRv8horOPkVkK0r1o0OwuW9.jpg' },
  { id: 'severance', type: 'tv', name: 'Severance', tmdbId: 95396, firstAired: '2022-02-17', posterPath: '/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg', backdropPath: '/ixgFmf1X59PUZam2qbAfskx2gQr.jpg' },
  { id: 'the-bear', type: 'tv', name: 'The Bear', tmdbId: 136315, firstAired: '2022-06-23', posterPath: '/eKfVzzEazSIjJMrw9ADa2x8ksLz.jpg', backdropPath: '/aJtG4txtmiRHwAAqENQHZvBs6kY.jpg' },
  { id: 'shogun', type: 'tv', name: 'Sh\u014dgun', tmdbId: 126308, firstAired: '2024-02-27', posterPath: '/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg', backdropPath: '/bwSmgmd90hCWwqOKQYTEraeOZhJ.jpg' },
  { id: 'the-last-of-us', type: 'tv', name: 'The Last of Us', tmdbId: 100088, firstAired: '2023-01-15', posterPath: '/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg', backdropPath: '/lY2DhbA7Hy44fAKddr06UrXWWaQ.jpg' },
  { id: 'slow-horses', type: 'tv', name: 'Slow Horses', tmdbId: 95480, firstAired: '2022-04-01', posterPath: '/AdYr4DjOgXvDUMwu6vEhZy1Rnxk.jpg', backdropPath: '/gPQppUnLx9vqPDLz3WwZ2HJsNbt.jpg' },
  { id: 'andor', type: 'tv', name: 'Andor', tmdbId: 83867, firstAired: '2022-09-21', posterPath: '/khZqmwHQicTYoS7Flreb9EddFZC.jpg', backdropPath: '/ajztm40qDPqMONaSJhQ2PaNe2Xd.jpg' },
  { id: 'fallout', type: 'tv', name: 'Fallout', tmdbId: 106379, firstAired: '2024-04-10', posterPath: '/c15BtJxCXMrISLVmysdsnZUPQft.jpg', backdropPath: '/coaPCIqQBPUZsOnJcWZxhaORcDT.jpg' },
  { id: 'house-of-the-dragon', type: 'tv', name: 'House of the Dragon', tmdbId: 94997, firstAired: '2022-08-21', posterPath: '/7V0Ebks0GgpKvQ7QbLAIdX5dos4.jpg', backdropPath: '/577eXC8wFQT0eUrJcgznSiFPRmk.jpg' },
  { id: 'the-boys', type: 'tv', name: 'The Boys', tmdbId: 76479, firstAired: '2019-07-25', posterPath: '/in1R2dDc421JxsoRWaIIAqVI2KE.jpg', backdropPath: '/bq28ajZaoMyzEIm6REelqyqtEDZ.jpg' },
  { id: 'silo', type: 'tv', name: 'Silo', tmdbId: 125988, firstAired: '2023-05-04', posterPath: '/r2QXomqKjkKHVtYGGtkf2l2Y7go.jpg', backdropPath: '/4XccmjsOmQZw8S2iW1wvlvmb5v1.jpg' },
  { id: 'foundation', type: 'tv', name: 'Foundation', tmdbId: 93740, firstAired: '2021-09-23', posterPath: '/tg9I5pOY4M9CKj8U0cxVBTsm5eh.jpg', backdropPath: '/7NNNXo0qG2SqH4JoG7GPvJ2hzes.jpg' },
  { id: 'ted-lasso', type: 'tv', name: 'Ted Lasso', tmdbId: 97546, firstAired: '2020-08-14', posterPath: '/uRHsiw1wLxPHFXkkv4Ix1s0O6f4.jpg', backdropPath: '/4bG49jVR7NrCNQjahDUsDqvIwle.jpg' },
  { id: 'stranger-things', type: 'tv', name: 'Stranger Things', tmdbId: 66732, firstAired: '2016-07-15', posterPath: '/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg', backdropPath: '/9P4IIMYY3HifqeruZq0ZZ9g7YUi.jpg' },
  { id: 'wednesday', type: 'tv', name: 'Wednesday', tmdbId: 119051, firstAired: '2022-11-23', posterPath: '/9PFonBhy4cQy7Jz20NpMygczOkv.jpg', backdropPath: '/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg' },
  { id: 'frieren-beyond-journey-s-end', type: 'anime', name: 'Frieren: Beyond Journey\'s End', tmdbId: 209867, firstAired: '2023-09-29', posterPath: '/dqZENchTd7lp5zht7BdlqM7RBhD.jpg', backdropPath: '/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg' },
  { id: 'saga-of-tanya-the-evil', type: 'anime', name: 'Saga of Tanya the Evil', tmdbId: 69346, firstAired: '2017-01-06', posterPath: '/5nwiHomKZBBF9DLrolfZapi3fDm.jpg', backdropPath: '/xe2IkfzpGFObODJLTpBB9bdRpbB.jpg' },
  { id: 'reincarnated-as-a-sword', type: 'anime', name: 'Reincarnated as a Sword', tmdbId: 134667, firstAired: '2022-10-05', posterPath: '/yZ3VZVc7iyF7KtIjERBGEedVXqA.jpg', backdropPath: '/fo5qwDAVqY7j2jmL350WKjk6kmi.jpg' },
  { id: 'black-clover', type: 'anime', name: 'Black Clover', tmdbId: 73223, firstAired: '2017-10-03', posterPath: '/uZUtoVChBGhNj9OfrM2LYpwBm8E.jpg', backdropPath: '/AsaEmDMgrt9MCCTXxUzY9PtFZko.jpg' },
  { id: 'a-wild-last-boss-appeared', type: 'anime', name: 'A Wild Last Boss Appeared!', tmdbId: 280042, firstAired: '2025-10-04', posterPath: '/xh9lu8gDgzwMBiByTRtTsclluZf.jpg', backdropPath: '/gNYmU3RUlCb6dVqkiPCT7vglMfg.jpg' },
  { id: 'my-gift-lvl-9999-unlimited-gacha', type: 'anime', name: 'My Gift Lvl 9999 Unlimited Gacha', tmdbId: 278635, firstAired: '2025-10-03', posterPath: '/8hhOcbDKJZvOD67N8GT0kdjNjd9.jpg', backdropPath: '/vnTrREtP0qBSmZHEEZR515FAXXB.jpg' },
  { id: 'that-time-i-got-reincarnated-as-a-slime', type: 'anime', name: 'That Time I Got Reincarnated as a Slime', tmdbId: 82684, firstAired: '2018-10-02', posterPath: '/pzujcdPAoH361NObVrtbA7zACE7.jpg', backdropPath: '/eJOy7YWAHgOS3V477sdTsq4v9jp.jpg' },
  { id: 'one-piece', type: 'anime', name: 'One Piece', tmdbId: 37854, firstAired: '1999-10-20', posterPath: '/dB4EDhre2dsC2kxYDavyKWqLQwi.jpg', backdropPath: '/2rmK7mnchw9Xr3XdiTFSxTTLXqv.jpg' },
  { id: 'mushoku-tensei-jobless-reincarnation', type: 'anime', name: 'Mushoku Tensei: Jobless Reincarnation', tmdbId: 94664, firstAired: '2021-01-11', posterPath: '/lDS7WuWrq6i1XC1AaKlf9qvJBVi.jpg', backdropPath: '/pfgndj46RLPVJRWkUSCJBgLJ93w.jpg' },
  { id: 'from-old-country-bumpkin-to-master-swordsman', type: 'anime', name: 'From Old Country Bumpkin to Master Swordsman', tmdbId: 260823, firstAired: '2025-04-05', posterPath: '/ujQp5egkJOkDHx4TehlgHePFcRv.jpg', backdropPath: '/sEagMcuLL3beaHc3ToiZicMuYSb.jpg' },
  { id: 'farming-life-in-another-world', type: 'anime', name: 'Farming Life in Another World', tmdbId: 196285, firstAired: '2023-01-06', posterPath: '/n8rforZjHAB9uxqbwy7g6EdertA.jpg', backdropPath: '/6XJ0XJbL14YkThOe1iU5TJKU5l3.jpg' },
  { id: 'solo-leveling', type: 'anime', name: 'Solo Leveling', tmdbId: 127532, firstAired: '2024-01-07', posterPath: '/geCRueV3ElhRTr0xtJuEWJt6dJ1.jpg', backdropPath: '/xMNH87maNLt9n2bMDYeI6db5VFm.jpg' },
  { id: 'dan-da-dan', type: 'anime', name: 'Dan Da Dan', tmdbId: 240411, firstAired: '2024-10-04', posterPath: '/6qfZAOEUFIrbUH3JvePclx1nXzz.jpg', backdropPath: '/uNTrRKIOyKYISthoeizghtXPEOK.jpg' },
  { id: 'jujutsu-kaisen', type: 'anime', name: 'Jujutsu Kaisen', tmdbId: 95479, firstAired: '2020-10-03', posterPath: '/6qQzMJG27XOJsyAEEIisoJB45j2.jpg', backdropPath: '/flgn0jXbg8GIe2qaWfd70A0uzfp.jpg' },
  { id: 'spy-x-family', type: 'anime', name: 'Spy x Family', tmdbId: 120089, firstAired: '2022-04-09', posterPath: '/7NAvPYPAu7MeHwP8E9sn81PqsRh.jpg', backdropPath: '/lysUnU6V0VfcthDbviuVlIqgHOR.jpg' },
  { id: 'chainsaw-man', type: 'anime', name: 'Chainsaw Man', tmdbId: 114410, firstAired: '2022-10-12', posterPath: '/npdB6eFzizki0WaZ1OvKcJrWe97.jpg', backdropPath: '/fOUKSCbZzaoQKsO39enivHnWDid.jpg' },
  { id: 'vinland-saga', type: 'anime', name: 'Vinland Saga', tmdbId: 88803, firstAired: '2019-07-08', posterPath: '/vUHlpA5c1NXkds59reY3HMb4Abs.jpg', backdropPath: '/sPN7Ylc7swmyukJeQBNcRAl9usS.jpg' },
  { id: 'delicious-in-dungeon', type: 'anime', name: 'Delicious in Dungeon', tmdbId: 207784, firstAired: '2024-01-04', posterPath: '/9t3DYdGxK3i4WRzKvIZwJd4kBnr.jpg', backdropPath: '/xC5GyeIzLsSRizJE5LedGShNgBa.jpg' },
  { id: 'kaiju-no-8', type: 'anime', name: 'Kaiju No. 8', tmdbId: 207468, firstAired: '2024-04-13', posterPath: '/83yDUQVpdhv8ePy3nbTRzFaKYuQ.jpg', backdropPath: '/htGeuCcNhlBe8GTx3izKOsd8frw.jpg' },
  { id: 'cyberpunk-edgerunners', type: 'anime', name: 'Cyberpunk: Edgerunners', tmdbId: 105248, firstAired: '2022-09-13', posterPath: '/v3JuB15WybKmxDeT1hWdK3j6eSJ.jpg', backdropPath: '/bknKZO7DWVYKeByuJMnGI46PFZg.jpg' },
  { id: 'transporter-2', type: 'movie', name: 'Transporter 2', tmdbId: 9335, firstAired: '2005-09-02', posterPath: '/cdm17vK8PxHfTi7ayZf6WKbOgUO.jpg', backdropPath: '/lbs1ood36hzj0O0cqW2a8MqptOh.jpg' },
  { id: 'the-lord-of-the-rings-the-two-towers', type: 'movie', name: 'The Lord of the Rings: The Two Towers', tmdbId: 121, firstAired: '2002-12-18', posterPath: '/5VTN0pR8gcqV3EPUHHfMGnJYN9L.jpg', backdropPath: '/58xrLn8VXDJSMntMESUyG4Pe1Ro.jpg' },
  { id: 'spider-man-brand-new-day', type: 'movie', name: 'Spider-Man: Brand New Day', tmdbId: 969681, firstAired: '2026-07-31', posterPath: '/bjiS5ipwxb9JFy3XRRN4OAilSeX.jpg', backdropPath: '/r08LxMJCbf1SiJIWeyH9aJmdqwC.jpg' },
  { id: 'ford-v-ferrari', type: 'movie', name: 'Ford v Ferrari', tmdbId: 359724, firstAired: '2019-11-15', posterPath: '/dR1Ju50iudrOh3YgfwkAU1g2HZe.jpg', backdropPath: '/2vq5GTJOahE03mNYZGxIynlHcWr.jpg' },
  { id: 'the-devil-wears-prada-2', type: 'movie', name: 'The Devil Wears Prada 2', tmdbId: 1314481, firstAired: '2026-05-01', posterPath: '/fCAURTUx3YfsJ8k9I0UamjSILiR.jpg', backdropPath: '/dRoFlUbH1l51ACmx5oPCI3jfvZq.jpg' },
  { id: 'mortal-kombat-ii', type: 'movie', name: 'Mortal Kombat II', tmdbId: 931285, firstAired: '2026-05-08', posterPath: '/hwRdDFIhaEmpRgoki805YvyyjZf.jpg', backdropPath: '/4EAAwpylq313qrDqpCxulUrXBNF.jpg' },
  { id: 'the-wrecking-crew', type: 'movie', name: 'The Wrecking Crew', tmdbId: 1168190, firstAired: '2026-01-28', posterPath: '/gbVwHl4YPSq6BcC92TQpe7qUTh6.jpg', backdropPath: '/cz4vLJrmaV1zJlRYbxqtvLzeLWB.jpg' },
  { id: 'glass-onion-a-knives-out-mystery', type: 'movie', name: 'Glass Onion: A Knives Out Mystery', tmdbId: 661374, firstAired: '2022-11-23', posterPath: '/vDGr1YdrlfbU9wxTOdpf3zChmv9.jpg', backdropPath: '/y3uOfZAYwLkbvhunswBCskNMrfI.jpg' },
  { id: 'wake-up-dead-man-a-knives-out-mystery', type: 'movie', name: 'Wake Up Dead Man: A Knives Out Mystery', tmdbId: 812583, firstAired: '2025-11-26', posterPath: '/iV9LM8aUb83BjCCx2RUnKE5sSQg.jpg', backdropPath: '/fiRDzpcJe7qz3yIR43hdXIE3NHv.jpg' },
  { id: 'blade-runner-2049', type: 'movie', name: 'Blade Runner 2049', tmdbId: 335984, firstAired: '2017-10-06', posterPath: '/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg', backdropPath: '/gNdLJU9TxrpGx4dkZidjys3fyy0.jpg' },
  { id: 'blade-runner', type: 'movie', name: 'Blade Runner', tmdbId: 78, firstAired: '1982-06-25', posterPath: '/63N9uy8nd9j7Eog2axPQ8lbr3Wj.jpg', backdropPath: '/2spEHYDcyE9r9mS7AFEscfKVDzO.jpg' },
  { id: 'ex-machina', type: 'movie', name: 'Ex Machina', tmdbId: 264660, firstAired: '2015-04-10', posterPath: '/dmJW8IAKHKxFNiUnoDR7JfsK7Rp.jpg', backdropPath: '/uqOuJ50EtTj7kkDIXP8LCg7G45D.jpg' },
  { id: 'dune-part-two', type: 'movie', name: 'Dune: Part Two', tmdbId: 693134, firstAired: '2024-03-01', posterPath: '/6izwz7rsy95ARzTR3poZ8H6c5pp.jpg', backdropPath: '/eZ239CUp1d6OryZEBPnO2n87gMG.jpg' },
  { id: 'oppenheimer', type: 'movie', name: 'Oppenheimer', tmdbId: 872585, firstAired: '2023-07-21', posterPath: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', backdropPath: '/neeNHeXjMF5fXoCJRsOmkNGC7q.jpg' },
  { id: 'wicked-for-good', type: 'movie', name: 'Wicked: For Good', tmdbId: 967941, firstAired: '2025-11-20', posterPath: '/si9tolnefLSUKaqQEGz1bWArOaL.jpg', backdropPath: '/cGbPBHKSFO7hSIjxkb3KOaGdOep.jpg' },
  { id: 'zootopia-2', type: 'movie', name: 'Zootopia 2', tmdbId: 1084242, firstAired: '2025-11-26', posterPath: '/oJ7g2CifqpStmoYQyaLQgEU32qO.jpg', backdropPath: '/lgotja3xMoJZbynwHfcQcJAEMWH.jpg' },
  { id: 'mad-max-fury-road', type: 'movie', name: 'Mad Max: Fury Road', tmdbId: 76341, firstAired: '2015-05-15', posterPath: '/ulcAi4dKpAjHwYGS08vNyx9H6I9.jpg', backdropPath: '/gqrnQA6Xppdl8vIb2eJc58VC1tW.jpg' },
  { id: 'interstellar', type: 'movie', name: 'Interstellar', tmdbId: 157336, firstAired: '2014-11-04', posterPath: '/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg', backdropPath: '/8sNiAPPYU14PUepFNeSNGUTiHW.jpg' },
  { id: 'everything-everywhere-all-at-once', type: 'movie', name: 'Everything Everywhere All at Once', tmdbId: 545611, firstAired: '2022-03-25', posterPath: '/u68AjlvlutfEIcpmbYpKcdi09ut.jpg', backdropPath: '/fIwiFha3WPu5nHkBeMQ4GzEk0Hv.jpg' },
  { id: 'sinners', type: 'movie', name: 'Sinners', tmdbId: 1233413, firstAired: '2025-04-18', posterPath: '/fWPgbnt2LSqkQ6cdQc0SZN9CpLm.jpg', backdropPath: '/j7KqDRzjbvIjDv7cdHz9G3ZYEQy.jpg' },
  { id: 'the-batman', type: 'movie', name: 'The Batman', tmdbId: 414906, firstAired: '2022-03-04', posterPath: '/74xTEgt7R36Fpooo50r9T25onhq.jpg', backdropPath: '/rvtdN5XkWAfGX6xDuPL6yYS2seK.jpg' },
  { id: 'knives-out', type: 'movie', name: 'Knives Out', tmdbId: 546554, firstAired: '2019-11-27', posterPath: '/pThyQovXQrw2m0s9x82twj48Jq4.jpg', backdropPath: '/4HWAQu28e2yaWrtupFPGFkdNU7V.jpg' },
  { id: 'dune', type: 'movie', name: 'Dune', tmdbId: 438631, firstAired: '2021-09-15', posterPath: '/v1tRXZ4JtD2Iv6fjkPvT4GiwslV.jpg', backdropPath: '/qVgZu5BTx6pu4owCvVOm4zjTfOi.jpg' },
  { id: 'dune-part-three', type: 'movie', name: 'Dune: Part Three', tmdbId: 1170608, firstAired: '2026-12-15', posterPath: '/d43fvHQsIMa4kpyhKXw0haEJIvI.jpg', backdropPath: '/i5E9H7Ik0u61ylDDTbmUpTL3Yw.jpg' }
]
