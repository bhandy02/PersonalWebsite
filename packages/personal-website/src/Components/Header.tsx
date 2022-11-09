import React, { Component } from 'react';
//import {AppConfigRetriever} from "../services/appconfig";


interface HeaderProps {
    data: any
}
interface HeaderState {
    feature: boolean,
    isLoading: boolean
}

class Header extends Component<HeaderProps, HeaderState> {
    //appConfigRetriever: AppConfigRetriever = new AppConfigRetriever();
    constructor(props: HeaderProps) {
        super(props);
        this.state = {
            feature: false,
            isLoading: true
        };
        //this.getFeatureFlag = this.getFeatureFlag.bind(this);
    }

    /*getFeatureFlag() {
        this.appConfigRetriever.getFeature('demo', 'demo', 'demoConfig', 'demoFeatureFlag').then((feature: boolean) => {
            this.setState({isLoading: false, feature})
        }).catch((err) => {
            console.error(err);
            alert(err);
            this.setState({isLoading: false});
        })
    }

    componentDidMount() {
        this.getFeatureFlag();
    }*/

    render() {


    if(this.props.data){
      var name = this.props.data.name;
      var occupation= this.props.data.occupation;
      var description= this.props.data.description;

      var networks= this.props.data.social.map(function(network: any){
        return <li key={network.name}><a href={network.url}><i className={network.className}></i></a></li>
      })
    }

    return (
      <header id="home">

      <nav id="nav-wrap">

         <a className="mobile-btn" href="#nav-wrap" title="Show navigation">Show navigation</a>
	      <a className="mobile-btn" href="#home" title="Hide navigation">Hide navigation</a>

         <ul id="nav" className="nav">
            <li className="current"><a className="smoothscroll" href="#home">Home</a></li>
            <li><a className="smoothscroll" href="#about">About</a></li>
	         <li><a className="smoothscroll" href="#resume">Resume</a></li>
            <li><a className="smoothscroll" href="#portfolio">Works</a></li>
            <li><a className="smoothscroll" href="#testimonials">Testimonials</a></li>
            <li><a className="smoothscroll" href="#contact">Contact</a></li>
         </ul>

      </nav>

      <div className="row banner">
         <div className="banner-text">
            <h1 className="responsive-headline">I'm {name}.</h1>
            <h3>I'm a Washington D.C. based <span>{occupation}</span>. {description}.</h3>
            <hr />
            <ul className="social">
               {networks}
            </ul>
         </div>
      </div>

      <p className="scrolldown">
         <a className="smoothscroll" href="#about"><i className="icon-down-circle"></i></a>
      </p>

   </header>
    );
  }
}

export default Header;
