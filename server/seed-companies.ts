import { companyContacts } from "@shared/schema";
import { db } from "./storage";

const COMPANY_DATA = `Company	Owner
1 Way Home Services, LLC	Sam Eram
1K Ventures Llc 	Jason Lee
3358 Grim Ave, LLC	Matt Davies
41st SD, LLC	Lee Paul Mankin
42 Doors Llc 	Aviv Levy
4384 Mississippi St Llc 	Matt Davies
4CROS INC	Sandeep Naraboina
5 Star Renovations Llc 	Alex Dolingov
5026 Faber Way LLC	Evyatar Rimoch
93-CMHS-94, LLC	Matt Eller
94 Investments Corp 	Guillermo Miranada
ABI Investments, LLC	Justin Lee
ADK Investments LLC	Danny Osman
ADZ Mortgage Rescue Inc	Norman F Jervis
Ajx Homes Llc	Jessie Trujillo
AKY Companies Inc	Khalid Yarash
Aldine Corp	Dann Schuetz
Alpha & Omega Import Export Inc	Aaron Salinas
AM Sturm Corporation	Paul Griffiths
Apollo Power Inc	Mike Sabosky
Apolo LLC	Richard Prag
ARE Holdings LLC	Neil Dutta
Aubrey Glen 07 LLC	Caleb Ferriera
Avalos Realty Inc	Emiliano Avalos
Balaton Lp	GG
Barker Brand Krenovations Llc	Tim Barker
Better Life Investments, LLC	Roberto Gomez
BFW, Inc	Alex Medina 
Black Arrow Enterprises LLC	Keith Robinson
Black Swan Logistics Holdings LLC	Xavier Rodriguez
Boardwalk Holdings LLC	Marcel Bonee / Kevin Gruidl
Boardwalk SC LLC	Bethany Carlson
BRD Developments LLC	Bohumil Hrdina
Breckenridge Property Fund 2016 Llc	Wedgewood
Brick & Equity 1 LLC	Eddie & Robe
Brick & Equity 2 LLC	Eddie & Robe
Buena Vista Villas, LLC	Neil Dutta
Capstone Properties I Inc	Stephen Deupree
Carrillo Property Investments Llc	Sammy Mendoza
Casa Vida Real Estate Group LLC	Jose de Jesus Torres Zamores
Cedarbook Capital, LLC	Daniel Maurer
Cedarbrook Capital, LLC	Dan Maurer
CHB Realty Inc	Bennett Segelman
Chewy Investments, LLC	Jessica Rocha
Clear Horizon Ventures LLC	Carlos Herrera
Cole Capital Investments Llc 	Andrew Cole
Countrywide Re Llc	CT Homes
Cove Capital Properties, LLC	David Foss
CPC INVESTMENTS LLC	Chase Cromwell
Crown Point Equities 	Kevin Armstrong
CRP Builder Inc	Ghullam Reza Khavari
Ct Dream Realty Llc 	CT Homes
D & A Ventures, LLC	Andrew Greer
DBZ Capital Ventures LLC	Kam Ng
Desert Investing Group LLC	Aydin Yildiz
Dogwood Bay Llc 	Christopher Nelson
Dream Homes Redesign Inc	Giuseppe Corbisiero
DSR Innovative Solutions	David Rutledge
Elevation Equity Real Estate LLC	Svetlana Novikova
Emprise Realty Group, LLC	Jason Nechodom
Fixer Upper San Diego Llc 	Neil Libin
Flip Flop Funds Holdings LLC	Jonathan Mitchell
Flippy Floppy Flippers LLC	Serri Rowell & George Fillippis
Fliptside Llc	Omar Elminoufi
Fortune ADU LLC	Sandeep Naraboina
Fresh Realty Solutions Llc 	Joshua Baker
GL Stockton Builders Inc	Gabe Stockton
Godavari Lp	GG
Golden State Investment Properties LLC	Stephen Burns
Grandfield Properties, LLC	Daniel Grandfield
HH Investment Inc	Herbert Herrera
HH Investment, Inc	Herbert W. Herrera
HHerro LLC	Benjamin Travis
Hl3 Alpha Llc 	Sundae
Home Repo Tour, Inc	Sammy Mendoza
Huseth Construction Inc.	Ryan Huseth
Ikonik Property Holdings Llc 	Alex Dolingov
Invest With Iconic Llc 	Chris Cordova
IRBOV LLC	Guillermo Miranda
Islander Investments Llc 	Drew Chance
Islander Properties Llc	Drew Chance
JGE Investments LLC	Josh Giordani
Jirca House Llc	Marco Pereda
Jlee Properties Llc 	Jason Lee
Joey Clement Inc.	Joey Clement
John Bradford Inc	Bradford W Damm
Jupiter Beach Inc.	Brian Mollo
JW RE Holdings LLC	Jameson Williams
Kast Properties, LLC	Shaun Casison
KD Developers LLC	Shaun Casison/Francisco Kelly
Kovalam Llc	Henish Pulickal
La Jolla Pacific Consultants	Fransico Fermania
Level Up Home Improvement LLC	John Andrew
Linked Capital LLC	Dan Beer
LPC Investment Group LLC	Andrew Adair
Lykos Holdings LLC	Brian Daly
Mac and Zac Development LLC	Michael Gary Sugich
Maple Estates CA LLC	Pooja Nicole Bansal
Mariscal 330 LLC	Michael Murphy
Market View Properties LLC	Ashley Cosentino
MB Floaters, LLC	Matthew Melendres
Midwest Capital Corp	Daniel Dallenbach
MMS Real Estate Solutions LLC	Salvador Jr Guillermo Valencia III
Mmtm Eight Llc	Christian Ballows
Momentum Blocks Llc 	Simon Saran
Monarch Investment Group 3 Llc 	Jason Lee
Montes Real Estate Investments LLC	Juan Pablo Montes
Mosvatn Llc	GG
MPV Real Estate Investments LLC	Caridad Bazan
MTW Properties LLC	Matt Welsch
Mucho Casas LLC	Ryan Oconner
Mylocal LLC	Carlos Elizondo
Nado RE Consultants LLC	William Mckanry
New Beginnings Ventures LLC	Sundae
New Fresh Investments Llc	Marcel Bonee
New Leaf Funding Inc	Rick Cao
New Leafs LLC	Tim Bundy
New Morning Inc.	David Zimkin
NextPhase Homes, LLC	Cade Silva
NextStep Properties LLC	Steven Jirjis
Nikolay Lorenzo Kalani	Nikolay Kalani
Noalca Inc	Andre Herrera
North Park Whisperer Llc 	Matt Davies
Omnia Investments Llc	Nolan Kulik & Jessica Lemus
Omniluxe Properties Llc 	Miguel Vargas
One Mission Properties Llc	Brian Daly
One Sophisticate LLC	Dillon Morgan
OP Investments LLC	Daniel Pereda
Opendoor Property Trust I	Open Door
Opendoor Property Trust I	Opendoor
Orange St Partners LLC	Andrew Greer & Keith Robinson
Orca Properties Inc	Mike Perry
Pacific Horizon Properties	Eric Morales
PIM Homes LLC	Max Seraj
Pinetree Ventures Llc	Guillermo Muiranda
Pink Sail Properties LLC	Timothy Bundy
Pinnacle Home Solutions Group LLC	Alan McGeever
Pioneer Investing Llc 	Ray Alsaigh
PK LUXES INVESTMENTS LLC	Liz Pereda
Pnr Homes Llc 	Ray Alsaigh
Pointview Properties, LLC	Nassir Azhdam
Pono Consulting, LLC	Andre Oliver
Pop Properties LLC	Nolan Kulik
Power Investments, Corp.	Moises Rodriguez Garcia
Precision Homes Llc	Daniel Tromello
Property Solutions by Design Inc	Kyoung Mi Cho
Quick Grand Llc 	Guillermo Miranada
Radiant Sunshine Investment Group LLC	Arthur M. Tsai
Ragafe, LLC	Rafael Camou
Ramirez Capital & Investments LLC	Matthew Ramirez
range homebuyers	Cade Silva
Range Homebuyers LLC	Cade Silva
Redwood Holdings Llc	Wedgewood 
Redwood Home, LLC	Ashley Rhame
Reflip Homes, LLC	Wesley J McAnally
Remark Ventures Llc	Paul Bruke
Renovate San Diego Llc	Memo Cardona
Reserva Homes LLC	Deliza Reserva
Reya and Company, Inc.	Ann Gullickson
Rice Interiors Llc 	Josh Oedewaldt
Rosewood Living, LLC	Alexander Limpin
Rossvatnet LLC	GG Homes
Royal Enterprises LLC	Svetlana Novikova
Royal Enterprises LLC	Jannet Novak
Royal Enterprises Llc 	Lana Novikova
Royal Hyde, LLC	Geraldine Barrera
Rubicon SD, LLC	Tim Bundy
Ryno, LLC Profit Sharing Plan	Ryan White
San Diego House Buyers Llc	Gus Guzman
Sequoia West Residential Llc	John Purdy
Sev Holdings LLC	Eric Vaca
Shermanator Properties, LLC	Gregory T. Ives
Signal West Llc	Acropolis
Silver Bay Homes Llc	Evion Marcos
Six Diamonds Cabins LLC	Austin Ball
Socal Solutions LLC	Jake Akers & Matt Corti
Socal WVM LLC	Walter De La Torre
Solutions Property Holdings Llc 	Marcel Bonee
Sterling Investment Group Inc	Nick Davison
Streamline Offer Llc 	Eddie Fonseca
Surf Hut Properties LLC	Shawn Couch
Tarbh Dubh Property Group Llc 	Alan McGeever
Teejay Enterprises Inc	Thomas Cupples
Terra Pacific Homes, Inc	Michael Rosendahl
The 12th Theory Development Inc	Luis Antonio Flores Ovando
The One Group Investment Fund LLC	Seth Struksma
The Pasto Family 2010 Trust	James Pasto & Dorothy Pasto
The Scott Kohls Trust	Scott Kohls
The Value Add Buyer Inc	Deborah See
Tlp1 Llc	True Craft
Triple Key Properties Llc	Michelle Stevenson
Turnkey Real Estate Llc 	Alex Flores & Mike Rosendalh
Two Intellects LLC	Dillon Morgan
Ultimate Assets, LLC	Mitchell Kane
Venture37 LLC	Daniel Poli
Vertigo Real Estate Ventures Llc 	Nadav Klein
Vpn Holdings Llc	Nolan Kulik
We Buy San Diego LLC	Deek Harms
WH1 LLC	Wedgewood
WH3 LLC	Wedgewood
WH4 LLC	Wedgewood
Wisdom Holdings LLC	Jim Ritter
WJ Sonata LLC	Wisam Jolagh
Yosemite Property Fund LLC	Fliptside
Zermatt LLC	GG
Tytum Llc 	Alex Golopapenko
815 Reed Llc 	Chris Luna
Backyard Acquisitions Llc 	Chris Luna
Pacific Residential Llc 	Joel Berman
12819 Dewey LLC	Adolfo Zamora & Aly Mewafi
939 Coast Blvd LJ LLC	Jorge Esses Ismaj
Arbib LLC	Ran Arbib
Intersite LLC	Jose Pintado
JB Roberts Inc.	Justin Roberts
My Way RE Solutions, Inc.	Giuseppe Corbisiero
Rocha Investments Corp	Elidio Rocha
S & S Homes Enterprises LLC	Sarmad Eram
Reya And Company Inc 	Mike Ratzky
Another Meade Deal Llc 	Carl Dumesle
D&G Estates Llc 	GARRETT REUTER
Deagle Investments Llc 	James De Leon
Mig 3514 Oak Glen LLC	Florian Sighe
Revival House Ventures Llc	Lindsey Michael
YURT LLC	Khalid Yarash
Good Deposits LLC	Daniel Alvarez
Nile Ventures LLC	Miran Mustafa
BAM3 Holdings LLC	Joey Belcastro
1216 Park Western LLC	Sergio Scerra
SC Surf Hut Properties, LLC	Shawn Couch
Majeed Homes LLC	Hanan Aliyu
Comfortkeys Realty LLC	Ghullam Reza Khavari
Espinoza Property T St LLC	Michael Anthony Espinoza
San Diego Property Solutions LLC	Jake Akers
LNL MEDICAL, LLC	Ayham Skaf
Caring Community Llc 	Axiom / Phillip Miller
Leaf and Sparrow Homes LLC	Gabe Stockton
PW Capital LLC	Gabe Stockton
4260 Cherokee Llc 	Moe Ali
Mcm 1 Llc 	Michael K. McMahan
Green Button Homes Llc 	Tom Tarrant
Monarch Builders Corp 	Kevin Trinh
Rsdco Llc 	Guillermo Cardona
Pro House Buyers Llc 	Gustavo Guzman
The Langley Organization Llc 	Bryan Langley
Noether Real Estate Holdings Llc 	TANYA K XAVIER
Aral LLC	ALPER MAHMUTGLU
2689 REYNARD LLC	Derek Nissley Falconer
975 Laguna LLC	Neel Pujara
Vista 468 Llc 	MATTHEW PACE
Exeter 22547 Wy Llc 	JEFFREY RESNICK
Wb La Mirada Llc 	JASON WIMP
Westwinds Place Llc 	Drew A Lambert
Prosper Edge Holdings Llc 	Margaret M. Oh
Sdsu Holdings Llc 	LAWRENCE BAME
4181 Van Dyke Llc 	Jagdish Sitlani
631 633 Hillside Terrace Llc 	CHRISTOS F. ELMENDORF
Babayka Equities Llc 	MARQUIS AURBACH CHTD
Blue Coast Holdings Llc 	JAIRT LAW
Ibcalla Llc 	Jim Purdy`;

export async function seedCompanyContacts() {
  console.log('Seeding company contacts...');
  
  const lines = COMPANY_DATA.split('\n').slice(1); // Skip header
  const contacts = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const companyName = parts[0].trim();
      const contactName = parts[1].trim();
      
      if (companyName && contactName) {
        contacts.push({
          companyName,
          contactName,
          contactEmail: null,
        });
      }
    }
  }
  
  console.log(`Inserting ${contacts.length} company contacts...`);
  
  try {
    await db.insert(companyContacts).values(contacts).onConflictDoNothing();
    console.log('Company contacts seeded successfully!');
  } catch (error) {
    console.error('Error seeding company contacts:', error);
  }
}
